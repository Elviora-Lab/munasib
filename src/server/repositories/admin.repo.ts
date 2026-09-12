import 'server-only';

import { type OrderStatus, type PaymentStatus, Prisma, type UserRole } from '@prisma/client';

import { productIntentScore, productIntentSignal, rate } from '@/lib/analytics/intent';
import { prisma } from '@/lib/db';
import { startOfStoreDay, startOfStoreWeek } from '@/utils/time';

import { inventoryRepo } from '@/server/repositories/inventory.repo';
import { inventoryService } from '@/server/services/inventory.service';

/**
 * Admin-side repositories. These intentionally ignore `is_active` /
 * `is_approved` filters so operators see the full state of the catalog.
 */

// ---------- Dashboard ----------

// Orders that count toward recognized revenue. An order is excluded when it is
// voided/returned/refunded by EITHER signal:
//   - orderStatus CANCELLED / RETURNED / REFUNDED, or
//   - paymentStatus REFUNDED / VOIDED (a refund recorded on the payment even if
//     the order status wasn't flipped).
// We deliberately do NOT require paymentStatus = PAID: COD / bank-transfer
// orders are fulfilled without ever flipping to PAID (only the Stripe webhook
// sets PAID), so a positive paymentStatus filter would undercount real sales.
// PARTIALLY_REFUNDED stays counted — without a stored refund amount we can't
// subtract the partial value, and dropping the whole order would over-deduct.
const REVENUE_WHERE: Prisma.OrderWhereInput = {
  orderStatus: { notIn: ['CANCELLED', 'RETURNED', 'REFUNDED'] },
  paymentStatus: { notIn: ['REFUNDED', 'VOIDED'] },
};

const sumRevenue = async (extra?: Prisma.OrderWhereInput) => {
  const agg = await prisma.order.aggregate({
    _sum: { totalAmount: true },
    where: { ...REVENUE_WHERE, ...extra },
  });
  return Number(agg._sum.totalAmount ?? 0);
};

export const adminDashboardRepo = {
  async kpis() {
    // Each variant's own reorder point wins, with the configurable shop-wide
    // default behind it — see `inventoryService.lowStockThreshold`.
    const threshold = await inventoryService.lowStockThreshold();

    const [
      revenue,
      revenueToday,
      revenueWeek,
      ordersLast30,
      productsCount,
      usersCount,
      pendingReviews,
      lowStockVariants,
    ] = await Promise.all([
      sumRevenue(),
      sumRevenue({ createdAt: { gte: startOfStoreDay() } }),
      sumRevenue({ createdAt: { gte: startOfStoreWeek() } }),
      prisma.order.count({
        where: { createdAt: { gte: daysAgo(30) } },
      }),
      prisma.product.count(),
      prisma.user.count({ where: { role: 'CUSTOMER' } }),
      prisma.review.count({ where: { isApproved: false } }),
      inventoryRepo.lowStockCount(threshold),
    ]);

    return {
      revenue,
      revenueToday,
      revenueWeek,
      ordersLast30,
      productsCount,
      usersCount,
      pendingReviews,
      lowStockVariants,
    };
  },

  recentOrders(limit = 5) {
    return prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { email: true, firstName: true } } },
    });
  },
};

function daysAgo(d: number) {
  return new Date(Date.now() - d * 24 * 60 * 60 * 1000);
}

// ---------- Products ----------

export type AdminProductSort =
  | 'created_desc'
  | 'created_asc'
  | 'name_asc'
  | 'name_desc'
  | 'price_asc'
  | 'price_desc';

export type AdminProductStockFilter = 'in' | 'out' | 'low';

export const adminProductsRepo = {
  list(
    opts: {
      skip?: number;
      take?: number;
      q?: string;
      categoryId?: string;
      brandId?: string;
      status?: 'active' | 'hidden';
      stock?: AdminProductStockFilter;
      featured?: boolean;
      sort?: AdminProductSort;
    } = {},
  ) {
    const stockWhere: Prisma.ProductWhereInput | undefined = (() => {
      if (opts.stock === 'in') return { variants: { some: { stockQuantity: { gt: 0 } } } };
      if (opts.stock === 'out') return { variants: { none: { stockQuantity: { gt: 0 } } } };
      if (opts.stock === 'low') {
        // Every variant is ≤5, and at least one unit remains.
        return {
          AND: [
            { variants: { some: { stockQuantity: { gt: 0 } } } },
            { variants: { none: { stockQuantity: { gt: 5 } } } },
          ],
        };
      }
      return undefined;
    })();

    const where: Prisma.ProductWhereInput = {
      ...(opts.q
        ? {
            OR: [
              { name: { contains: opts.q, mode: 'insensitive' } },
              { sku: { contains: opts.q, mode: 'insensitive' } },
              // slug carries the shade token (e.g. "…-cs-40"), so this lets
              // operators search a specific shade.
              { slug: { contains: opts.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
      ...(opts.brandId ? { brandId: opts.brandId } : {}),
      ...(opts.status ? { isActive: opts.status === 'active' } : {}),
      ...(opts.featured === true ? { isFeatured: true } : {}),
      ...(stockWhere ?? {}),
    };

    const orderBy: Prisma.ProductOrderByWithRelationInput = (() => {
      switch (opts.sort) {
        case 'created_asc':
          return { createdAt: 'asc' };
        case 'name_asc':
          return { name: 'asc' };
        case 'name_desc':
          return { name: 'desc' };
        case 'price_asc':
          return { price: 'asc' };
        case 'price_desc':
          return { price: 'desc' };
        case 'created_desc':
        default:
          return { createdAt: 'desc' };
      }
    })();

    return prisma.$transaction([
      prisma.product.findMany({
        where,
        orderBy,
        skip: opts.skip ?? 0,
        take: opts.take ?? 50,
        // select, not include: the table renders six columns — pulling every
        // product column (notably the Text description) here is pure payload.
        select: {
          id: true,
          name: true,
          slug: true,
          sku: true,
          price: true,
          isActive: true,
          category: { select: { name: true } },
          images: { where: { isPrimary: true }, take: 1, select: { imageUrl: true } },
          variants: { select: { stockQuantity: true, shade: true } },
        },
      }),
      prisma.product.count({ where }),
    ]);
  },

  findById(id: string) {
    return prisma.product.findUnique({
      where: { id },
      include: {
        variants: { orderBy: { sku: 'asc' } },
        images: { orderBy: { sortOrder: 'asc' } },
      },
    });
  },

  create(data: Prisma.ProductCreateInput) {
    return prisma.product.create({ data });
  },

  update(id: string, data: Prisma.ProductUpdateInput) {
    return prisma.product.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.product.delete({ where: { id } });
  },

  async bulkSetActive(ids: string[], isActive: boolean) {
    const { count } = await prisma.product.updateMany({
      where: { id: { in: ids } },
      data: { isActive },
    });
    return count;
  },

  /** Slugs for a set of product ids — used to invalidate their PDP caches. */
  slugsForIds(ids: string[]) {
    return prisma.product.findMany({ where: { id: { in: ids } }, select: { slug: true } });
  },
};

// ---------- Orders ----------

export type AdminOrderSort = 'created_desc' | 'created_asc' | 'total_desc' | 'total_asc';

export const adminOrdersRepo = {
  list(
    opts: {
      status?: OrderStatus;
      paymentStatus?: PaymentStatus;
      q?: string;
      skip?: number;
      take?: number;
      /** Kitchen stage filter — only applied with status PROCESSING (or CONFIRMED for needs_booking). */
      stage?: 'NEEDS_BOOKING' | 'BOOKED' | 'PRINTED' | 'PACKED' | 'LEFTOVER';
      sort?: AdminOrderSort;
    } = {},
  ) {
    const q = opts.q?.trim();
    const stage = opts.stage;

    // Start of "today" in Asia/Karachi for leftover filtering.
    const todayKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const leftoverBefore = new Date(`${todayKey}T00:00:00+05:00`);

    const stageWhere: Prisma.OrderWhereInput | undefined = (() => {
      if (!stage) return undefined;
      if (stage === 'NEEDS_BOOKING') {
        return {
          orderStatus: { in: ['CONFIRMED', 'PROCESSING'] },
          OR: [
            { shipments: { none: {} } },
            { shipments: { none: { trackingNumber: { not: null } } } },
          ],
        };
      }
      if (stage === 'BOOKED') {
        return {
          orderStatus: 'PROCESSING',
          shipments: {
            some: {
              trackingNumber: { not: null },
              labelPrintedAt: null,
            },
          },
        };
      }
      if (stage === 'PRINTED') {
        return {
          orderStatus: 'PROCESSING',
          shipments: {
            some: {
              trackingNumber: { not: null },
              labelPrintedAt: { not: null },
              packedAt: null,
            },
          },
        };
      }
      if (stage === 'PACKED') {
        return {
          orderStatus: 'PROCESSING',
          shipments: {
            some: {
              trackingNumber: { not: null },
              packedAt: { not: null },
            },
          },
        };
      }
      // LEFTOVER — booked/printed/packed before today, still PROCESSING
      return {
        orderStatus: 'PROCESSING',
        shipments: {
          some: {
            trackingNumber: { not: null },
            OR: [
              { packedAt: { not: null, lt: leftoverBefore } },
              { packedAt: null, labelPrintedAt: { not: null, lt: leftoverBefore } },
              {
                packedAt: null,
                labelPrintedAt: null,
                createdAt: { lt: leftoverBefore },
              },
            ],
          },
        },
      };
    })();

    const where: Prisma.OrderWhereInput = {
      ...(stageWhere ? stageWhere : opts.status ? { orderStatus: opts.status } : {}),
      ...(opts.paymentStatus ? { paymentStatus: opts.paymentStatus } : {}),
      ...(q
        ? {
            OR: [
              { orderNumber: { contains: q, mode: 'insensitive' } },
              { shippingFullName: { contains: q, mode: 'insensitive' } },
              { shippingEmail: { contains: q, mode: 'insensitive' } },
              { shippingPhone: { contains: q, mode: 'insensitive' } },
              { shippingCity: { contains: q, mode: 'insensitive' } },
              { user: { email: { contains: q, mode: 'insensitive' } } },
              {
                user: {
                  OR: [
                    { firstName: { contains: q, mode: 'insensitive' } },
                    { lastName: { contains: q, mode: 'insensitive' } },
                  ],
                },
              },
              { shipments: { some: { trackingNumber: { contains: q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    // Explicit sort wins. Otherwise stage views (except needs-booking) are oldest-first.
    const orderBy: Prisma.OrderOrderByWithRelationInput = (() => {
      switch (opts.sort) {
        case 'created_asc':
          return { createdAt: 'asc' };
        case 'total_desc':
          return { totalAmount: 'desc' };
        case 'total_asc':
          return { totalAmount: 'asc' };
        case 'created_desc':
          return { createdAt: 'desc' };
        default:
          return stage && stage !== 'NEEDS_BOOKING' ? { createdAt: 'asc' } : { createdAt: 'desc' };
      }
    })();

    return prisma.$transaction([
      prisma.order.findMany({
        where,
        orderBy,
        skip: opts.skip ?? 0,
        take: opts.take ?? 50,
        include: {
          user: { select: { email: true, firstName: true, lastName: true } },
          shipments: {
            orderBy: [{ shippedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
            take: 1,
            select: {
              courierName: true,
              trackingNumber: true,
              shipmentStatus: true,
              trackingStatusText: true,
              trackingJourney: true,
              trackingSyncedAt: true,
              createdAt: true,
              labelPrintedAt: true,
              packedAt: true,
            },
          },
          _count: { select: { items: true } },
        },
      }),
      prisma.order.count({ where }),
    ]);
  },

  /** Counts for Processing stage chips (Pakistan "today" for leftover). */
  async fulfillmentStageCounts() {
    const todayKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const leftoverBefore = new Date(`${todayKey}T00:00:00+05:00`);

    const [needsBooking, booked, printed, packed, leftover] = await Promise.all([
      prisma.order.count({
        where: {
          orderStatus: { in: ['CONFIRMED', 'PROCESSING'] },
          OR: [
            { shipments: { none: {} } },
            { shipments: { none: { trackingNumber: { not: null } } } },
          ],
        },
      }),
      prisma.order.count({
        where: {
          orderStatus: 'PROCESSING',
          shipments: { some: { trackingNumber: { not: null }, labelPrintedAt: null } },
        },
      }),
      prisma.order.count({
        where: {
          orderStatus: 'PROCESSING',
          shipments: {
            some: {
              trackingNumber: { not: null },
              labelPrintedAt: { not: null },
              packedAt: null,
            },
          },
        },
      }),
      prisma.order.count({
        where: {
          orderStatus: 'PROCESSING',
          shipments: { some: { trackingNumber: { not: null }, packedAt: { not: null } } },
        },
      }),
      prisma.order.count({
        where: {
          orderStatus: 'PROCESSING',
          shipments: {
            some: {
              trackingNumber: { not: null },
              OR: [
                { packedAt: { not: null, lt: leftoverBefore } },
                { packedAt: null, labelPrintedAt: { not: null, lt: leftoverBefore } },
                {
                  packedAt: null,
                  labelPrintedAt: null,
                  createdAt: { lt: leftoverBefore },
                },
              ],
            },
          },
        },
      }),
    ]);

    return { needsBooking, booked, printed, packed, leftover };
  },

  /**
   * What still needs packing: line items across orders in the given statuses,
   * rolled up by variant (or product snapshot when the variant is gone).
   *
   * Defaults to PENDING — the status every checkout starts in — so the page is
   * a pick list for orders that haven't moved into fulfilment yet.
   */
  /**
   * Aggregated pick list + per-order breakdown for open kitchen work.
   * Optional fulfillment `stage` narrows to booked / printed / etc.
   */
  async pendingItems(
    opts: {
      statuses?: OrderStatus[];
      stage?: 'NEEDS_BOOKING' | 'BOOKED' | 'PRINTED' | 'PACKED' | 'LEFTOVER';
      /** Inclusive order `createdAt` lower bound (store TZ day start). */
      createdFrom?: Date;
      /** Exclusive order `createdAt` upper bound. */
      createdToExclusive?: Date;
    } = {},
  ) {
    const statusList =
      opts.statuses && opts.statuses.length > 0
        ? opts.statuses
        : (['PENDING', 'CONFIRMED', 'PROCESSING'] as OrderStatus[]);
    const stage = opts.stage;

    const todayKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const leftoverBefore = new Date(`${todayKey}T00:00:00+05:00`);

    const stageWhere: Prisma.OrderWhereInput | undefined = (() => {
      if (!stage) return undefined;
      if (stage === 'NEEDS_BOOKING') {
        return {
          orderStatus: { in: ['CONFIRMED', 'PROCESSING'] },
          OR: [
            { shipments: { none: {} } },
            { shipments: { none: { trackingNumber: { not: null } } } },
          ],
        };
      }
      if (stage === 'BOOKED') {
        return {
          orderStatus: 'PROCESSING',
          shipments: {
            some: {
              trackingNumber: { not: null },
              labelPrintedAt: null,
            },
          },
        };
      }
      if (stage === 'PRINTED') {
        return {
          orderStatus: 'PROCESSING',
          shipments: {
            some: {
              trackingNumber: { not: null },
              labelPrintedAt: { not: null },
              packedAt: null,
            },
          },
        };
      }
      if (stage === 'PACKED') {
        return {
          orderStatus: 'PROCESSING',
          shipments: {
            some: {
              trackingNumber: { not: null },
              packedAt: { not: null },
            },
          },
        };
      }
      return {
        orderStatus: 'PROCESSING',
        shipments: {
          some: {
            trackingNumber: { not: null },
            OR: [
              { packedAt: { not: null, lt: leftoverBefore } },
              { packedAt: null, labelPrintedAt: { not: null, lt: leftoverBefore } },
              {
                packedAt: null,
                labelPrintedAt: null,
                createdAt: { lt: leftoverBefore },
              },
            ],
          },
        },
      };
    })();

    const orderWhere: Prisma.OrderWhereInput = {
      ...(stageWhere ? stageWhere : { orderStatus: { in: statusList } }),
      ...(opts.createdFrom || opts.createdToExclusive
        ? {
            createdAt: {
              ...(opts.createdFrom ? { gte: opts.createdFrom } : {}),
              ...(opts.createdToExclusive ? { lt: opts.createdToExclusive } : {}),
            },
          }
        : {}),
    };

    const matchingOrders = await prisma.order.findMany({
      where: orderWhere,
      select: { id: true },
    });
    const orderIds = matchingOrders.map((o) => o.id);

    if (orderIds.length === 0) {
      return { aggregated: [], orders: [] };
    }

    const [aggregated, orders] = await Promise.all([
      prisma.$queryRaw<
        Array<{
          product_id: string | null;
          variant_id: string | null;
          product_name: string;
          variant_name: string | null;
          size: string | null;
          shade: string | null;
          fragrance: string | null;
          product_slug: string | null;
          variant_image: string | null;
          product_image: string | null;
          total_quantity: bigint;
          order_count: bigint;
        }>
      >`
        SELECT oi."product_id",
               oi."variant_id",
               oi."product_name",
               oi."variant_name",
               pv."size",
               pv."shade",
               pv."fragrance",
               p."slug" AS product_slug,
               (
                 SELECT pi."image_url"
                 FROM "product_images" pi
                 WHERE pi."variant_id" = oi."variant_id"
                 ORDER BY pi."is_primary" DESC, pi."sort_order" ASC
                 LIMIT 1
               ) AS variant_image,
               (
                 SELECT pi."image_url"
                 FROM "product_images" pi
                 WHERE pi."product_id" = oi."product_id" AND pi."variant_id" IS NULL
                 ORDER BY pi."is_primary" DESC, pi."sort_order" ASC
                 LIMIT 1
               ) AS product_image,
               SUM(oi."quantity")::bigint AS total_quantity,
               COUNT(DISTINCT oi."order_id")::bigint AS order_count
        FROM "order_items" oi
        LEFT JOIN "product_variants" pv ON pv."id" = oi."variant_id"
        LEFT JOIN "products" p ON p."id" = oi."product_id"
        WHERE oi."order_id" = ANY(${orderIds}::uuid[])
        GROUP BY oi."product_id", oi."variant_id", oi."product_name", oi."variant_name",
                 pv."size", pv."shade", pv."fragrance", p."slug"
        ORDER BY SUM(oi."quantity") DESC, oi."product_name" ASC`,

      prisma.order.findMany({
        where: { id: { in: orderIds } },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          orderNumber: true,
          orderStatus: true,
          paymentStatus: true,
          createdAt: true,
          shippingFullName: true,
          shippingPhone: true,
          shippingCity: true,
          shipments: {
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 1,
            select: {
              trackingNumber: true,
              labelPrintedAt: true,
              packedAt: true,
            },
          },
          user: { select: { firstName: true, lastName: true, email: true } },
          items: {
            select: {
              id: true,
              productName: true,
              variantName: true,
              quantity: true,
              product: {
                select: {
                  slug: true,
                  images: {
                    where: { variantId: null },
                    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
                    take: 1,
                    select: { imageUrl: true },
                  },
                },
              },
              variant: {
                select: {
                  size: true,
                  shade: true,
                  fragrance: true,
                  images: {
                    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
                    take: 1,
                    select: { imageUrl: true },
                  },
                },
              },
            },
            orderBy: { productName: 'asc' },
          },
        },
      }),
    ]);

    return {
      aggregated: aggregated.map((row) => ({
        productId: row.product_id,
        variantId: row.variant_id,
        productName: row.product_name,
        variantName: row.variant_name,
        size: row.size,
        shade: row.shade,
        fragrance: row.fragrance,
        productSlug: row.product_slug,
        imageUrl: row.variant_image ?? row.product_image,
        totalQuantity: Number(row.total_quantity),
        orderCount: Number(row.order_count),
      })),
      orders: orders.map((order) => ({
        ...order,
        trackingNumber: order.shipments[0]?.trackingNumber ?? null,
        labelPrintedAt: order.shipments[0]?.labelPrintedAt ?? null,
        packedAt: order.shipments[0]?.packedAt ?? null,
        items: order.items.map((item) => ({
          id: item.id,
          productName: item.productName,
          variantName: item.variantName,
          quantity: item.quantity,
          productSlug: item.product?.slug ?? null,
          imageUrl: item.variant?.images[0]?.imageUrl ?? item.product?.images[0]?.imageUrl ?? null,
          size: item.variant?.size ?? null,
          shade: item.variant?.shade ?? null,
          fragrance: item.variant?.fragrance ?? null,
        })),
      })),
    };
  },

  findById(id: string) {
    return prisma.order.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            role: true,
          },
        },
        items: {
          include: {
            // The ordered variant, for the exact shade/size/fragrance and its
            // own photo. `variantName` on the item is only a text snapshot, so
            // this is what lets the admin see WHICH shade actually shipped.
            variant: {
              select: {
                id: true,
                sku: true,
                size: true,
                shade: true,
                fragrance: true,
                images: {
                  orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
                  take: 1,
                  select: { imageUrl: true, altText: true },
                },
              },
            },
            product: {
              select: {
                slug: true,
                // variantId: null ⇒ generic product shots only. A variant-tagged
                // image here would be some OTHER shade's photo, and showing the
                // wrong shade to whoever is packing the box is worse than
                // showing no photo at all.
                images: {
                  where: { variantId: null },
                  orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
                  take: 1,
                  select: { imageUrl: true, altText: true },
                },
              },
            },
          },
        },
        payments: true,
        shipments: true,
        statusHistory: { orderBy: { createdAt: 'desc' } },
      },
    });
  },
};

// ---------- Reviews ----------

export const adminReviewsRepo = {
  listPending(opts: { skip?: number; take?: number } = {}) {
    return prisma.$transaction([
      prisma.review.findMany({
        where: { isApproved: false },
        orderBy: { createdAt: 'desc' },
        skip: opts.skip ?? 0,
        take: opts.take ?? 50,
        include: {
          user: { select: { firstName: true, lastName: true, email: true } },
          product: { select: { name: true, slug: true } },
          images: true,
        },
      }),
      prisma.review.count({ where: { isApproved: false } }),
    ]);
  },

  approve(id: string) {
    return prisma.review.update({ where: { id }, data: { isApproved: true } });
  },

  delete(id: string) {
    return prisma.review.delete({ where: { id } });
  },
};

// ---------- Categories ----------

export const adminCategoriesRepo = {
  listAll() {
    return prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        parent: { select: { name: true } },
        // Count MEMBERSHIPS, not just products holding this as their primary
        // category. The admin page blocks deletion on this count, and deleting
        // a category cascades its membership rows away — so counting primaries
        // only would let an operator silently unmerchandise products that are
        // in this category as a secondary.
        _count: { select: { productMappings: true } },
      },
    });
  },

  create(data: Prisma.CategoryCreateInput) {
    return prisma.category.create({ data });
  },

  update(id: string, data: Prisma.CategoryUpdateInput) {
    return prisma.category.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.category.delete({ where: { id } });
  },
};

// ---------- Brands ----------

export const adminBrandsRepo = {
  listAll() {
    return prisma.brand.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    });
  },

  create(data: Prisma.BrandCreateInput) {
    return prisma.brand.create({ data });
  },

  update(id: string, data: Prisma.BrandUpdateInput) {
    return prisma.brand.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.brand.delete({ where: { id } });
  },
};

// ---------- Analytics ----------

type ProductLite = { id: string; name: string; slug: string; imageUrl: string };
type RankedProduct = ProductLite & { count: number };
export type ProductIntentRow = ProductLite & {
  category: string | null;
  views: number;
  carts: number;
  purchases: number;
  quantity: number;
  revenue: number;
  cartRate: number;
  purchaseRate: number;
  cartToPurchaseRate: number;
  score: number;
  signal: ReturnType<typeof productIntentSignal>;
};
export type SearchIntentRow = {
  keyword: string;
  count: number;
  zeroResults: number;
  avgResults: number;
};
export type CityPerformanceRow = {
  city: string;
  orders: number;
  revenue: number;
  avgOrderValue: number;
};
export type UtmPerformanceRow = {
  source: string;
  campaign: string;
  orders: number;
  revenue: number;
  avgOrderValue: number;
};
export type AbandonedCartPressure = {
  carts: number;
  staleCarts: number;
  items: number;
  value: number;
  topProducts: Array<ProductLite & { carts: number; quantity: number; value: number }>;
};

/** Resolve product display info for a set of ids, keyed by id. */
async function resolveProducts(ids: string[]): Promise<Map<string, ProductLite>> {
  if (ids.length === 0) return new Map();
  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      slug: true,
      images: { where: { isPrimary: true }, take: 1, select: { imageUrl: true } },
    },
  });
  return new Map(
    products.map((p) => [
      p.id,
      { id: p.id, name: p.name, slug: p.slug, imageUrl: p.images[0]?.imageUrl ?? '' },
    ]),
  );
}

const since = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

export const adminAnalyticsRepo = {
  /** Top viewed products in the window, with display info. */
  async topViewed(days: number, limit = 8): Promise<RankedProduct[]> {
    const rows = await prisma.productViewLog.groupBy({
      by: ['productId'],
      where: { viewedAt: { gte: since(days) } },
      _count: { productId: true },
      orderBy: { _count: { productId: 'desc' } },
      take: limit,
    });
    const map = await resolveProducts(rows.map((r) => r.productId));
    return rows.flatMap((r) => {
      const p = map.get(r.productId);
      return p ? [{ ...p, count: r._count.productId }] : [];
    });
  },

  /** Top products added to cart in the window, with display info. */
  async topAddedToCart(days: number, limit = 8): Promise<RankedProduct[]> {
    const rows = await prisma.cartEventLog.groupBy({
      by: ['productId'],
      where: { createdAt: { gte: since(days) } },
      _count: { productId: true },
      orderBy: { _count: { productId: 'desc' } },
      take: limit,
    });
    const map = await resolveProducts(rows.map((r) => r.productId));
    return rows.flatMap((r) => {
      const p = map.get(r.productId);
      return p ? [{ ...p, count: r._count.productId }] : [];
    });
  },

  /** Top search keywords in the window. */
  async topSearches(days: number, limit = 8): Promise<Array<{ keyword: string; count: number }>> {
    const rows = await prisma.searchLog.groupBy({
      by: ['keyword'],
      where: { searchedAt: { gte: since(days) } },
      _count: { keyword: true },
      orderBy: { _count: { keyword: 'desc' } },
      take: limit,
    });
    return rows.map((r) => ({ keyword: r.keyword, count: r._count.keyword }));
  },

  /** Searches that returned NOTHING — demand you don't stock or can't be found. */
  async zeroResultSearches(
    days: number,
    limit = 10,
  ): Promise<Array<{ keyword: string; count: number }>> {
    const rows = await prisma.searchLog.groupBy({
      by: ['keyword'],
      where: { searchedAt: { gte: since(days) }, resultCount: 0 },
      _count: { keyword: true },
      orderBy: { _count: { keyword: 'desc' } },
      take: limit,
    });
    return rows.map((r) => ({ keyword: r.keyword, count: r._count.keyword }));
  },

  /** On-site survey answers grouped by question → answer, most-common first. */
  async surveyBreakdown(
    days: number,
  ): Promise<Array<{ question: string; answer: string; count: number }>> {
    const rows = await prisma.surveyResponse.groupBy({
      by: ['question', 'answer'],
      where: { createdAt: { gte: since(days) } },
      _count: { answer: true },
      orderBy: { _count: { answer: 'desc' } },
    });
    return rows.map((r) => ({ question: r.question, answer: r.answer, count: r._count.answer }));
  },

  /** View → cart → order volumes for the window (the funnel). */
  async funnel(days: number) {
    const gte = since(days);
    const [views, cartAdds, orders] = await Promise.all([
      prisma.productViewLog.count({ where: { viewedAt: { gte } } }),
      prisma.cartEventLog.count({ where: { createdAt: { gte } } }),
      prisma.order.count({ where: { createdAt: { gte } } }),
    ]);
    return { views, cartAdds, orders };
  },

  async productIntent(days: number, limit = 12): Promise<ProductIntentRow[]> {
    const gte = since(days);
    type Row = {
      id: string;
      name: string;
      slug: string;
      imageUrl: string | null;
      category: string | null;
      views: number;
      carts: number;
      purchases: number;
      quantity: number;
      revenue: number;
    };
    const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
      WITH views AS (
        SELECT product_id, COUNT(*)::int AS views
        FROM product_view_logs
        WHERE viewed_at >= ${gte}
        GROUP BY product_id
      ),
      carts AS (
        SELECT product_id, COUNT(*)::int AS carts
        FROM cart_event_logs
        WHERE created_at >= ${gte}
        GROUP BY product_id
      ),
      sales AS (
        SELECT oi.product_id,
               COUNT(DISTINCT o.id)::int AS purchases,
               COALESCE(SUM(oi.quantity), 0)::int AS quantity,
               COALESCE(SUM(oi.total_price), 0)::float AS revenue
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.created_at >= ${gte}
          AND o.order_status NOT IN ('CANCELLED', 'RETURNED', 'REFUNDED')
          AND o.payment_status NOT IN ('REFUNDED', 'VOIDED')
          AND oi.product_id IS NOT NULL
        GROUP BY oi.product_id
      )
      SELECT p.id,
             p.name,
             p.slug,
             c.name AS category,
             img.image_url AS "imageUrl",
             COALESCE(v.views, 0)::int AS views,
             COALESCE(ca.carts, 0)::int AS carts,
             COALESCE(s.purchases, 0)::int AS purchases,
             COALESCE(s.quantity, 0)::int AS quantity,
             COALESCE(s.revenue, 0)::float AS revenue
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN views v ON v.product_id = p.id
      LEFT JOIN carts ca ON ca.product_id = p.id
      LEFT JOIN sales s ON s.product_id = p.id
      LEFT JOIN LATERAL (
        SELECT image_url
        FROM product_images
        WHERE product_id = p.id
        ORDER BY is_primary DESC, sort_order ASC
        LIMIT 1
      ) img ON true
      WHERE COALESCE(v.views, 0) + COALESCE(ca.carts, 0) + COALESCE(s.purchases, 0) > 0
      ORDER BY (COALESCE(s.purchases, 0) * 10 + COALESCE(ca.carts, 0) * 3 + COALESCE(v.views, 0)) DESC
      LIMIT ${limit}
    `);

    return rows.map((r) => {
      const counts = {
        views: Number(r.views),
        carts: Number(r.carts),
        purchases: Number(r.purchases),
      };
      return {
        id: r.id,
        name: r.name,
        slug: r.slug,
        imageUrl: r.imageUrl ?? '',
        category: r.category,
        views: counts.views,
        carts: counts.carts,
        purchases: counts.purchases,
        quantity: Number(r.quantity),
        revenue: Number(r.revenue),
        cartRate: rate(counts.carts, counts.views),
        purchaseRate: rate(counts.purchases, counts.views),
        cartToPurchaseRate: rate(counts.purchases, counts.carts),
        score: productIntentScore(counts),
        signal: productIntentSignal(counts),
      };
    });
  },

  async searchIntent(days: number, limit = 12): Promise<SearchIntentRow[]> {
    const rows = await prisma.$queryRaw<SearchIntentRow[]>(Prisma.sql`
      SELECT keyword,
             COUNT(*)::int AS count,
             COUNT(*) FILTER (WHERE result_count = 0)::int AS "zeroResults",
             COALESCE(AVG(result_count), 0)::float AS "avgResults"
      FROM search_logs
      WHERE searched_at >= ${since(days)}
      GROUP BY keyword
      ORDER BY count DESC
      LIMIT ${limit}
    `);
    return rows.map((r) => ({
      keyword: r.keyword,
      count: Number(r.count),
      zeroResults: Number(r.zeroResults),
      avgResults: Number(r.avgResults),
    }));
  },

  async cityPerformance(days: number, limit = 10): Promise<CityPerformanceRow[]> {
    const gte = since(days);
    const rows = await prisma.$queryRaw<
      Array<{ city: string; orders: number; revenue: number; avgOrderValue: number }>
    >(Prisma.sql`
      SELECT COALESCE(NULLIF(shipping_city, ''), 'Unknown') AS city,
             COUNT(*)::int AS orders,
             COALESCE(SUM(total_amount), 0)::float AS revenue,
             COALESCE(AVG(total_amount), 0)::float AS "avgOrderValue"
      FROM orders
      WHERE created_at >= ${gte}
        AND order_status NOT IN ('CANCELLED', 'RETURNED', 'REFUNDED')
        AND payment_status NOT IN ('REFUNDED', 'VOIDED')
      GROUP BY 1
      ORDER BY orders DESC, revenue DESC
      LIMIT ${limit}
    `);
    return rows.map((r) => ({
      city: r.city,
      orders: Number(r.orders),
      revenue: Number(r.revenue),
      avgOrderValue: Number(r.avgOrderValue),
    }));
  },

  async utmPerformance(days: number, limit = 10): Promise<UtmPerformanceRow[]> {
    const gte = since(days);
    const rows = await prisma.$queryRaw<
      Array<{
        source: string;
        campaign: string;
        orders: number;
        revenue: number;
        avgOrderValue: number;
      }>
    >(Prisma.sql`
      SELECT COALESCE(NULLIF(utm_source, ''), 'direct/unknown') AS source,
             COALESCE(NULLIF(utm_campaign, ''), 'untracked') AS campaign,
             COUNT(*)::int AS orders,
             COALESCE(SUM(total_amount), 0)::float AS revenue,
             COALESCE(AVG(total_amount), 0)::float AS "avgOrderValue"
      FROM orders
      WHERE created_at >= ${gte}
        AND order_status NOT IN ('CANCELLED', 'RETURNED', 'REFUNDED')
        AND payment_status NOT IN ('REFUNDED', 'VOIDED')
      GROUP BY 1, 2
      ORDER BY revenue DESC, orders DESC
      LIMIT ${limit}
    `);
    return rows.map((r) => ({
      source: r.source,
      campaign: r.campaign,
      orders: Number(r.orders),
      revenue: Number(r.revenue),
      avgOrderValue: Number(r.avgOrderValue),
    }));
  },

  async abandonedCartPressure(days: number, limit = 8): Promise<AbandonedCartPressure> {
    const gte = since(days);
    const staleBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [summaryRows, productRows] = await Promise.all([
      prisma.$queryRaw<
        Array<{ carts: number; staleCarts: number; items: number; value: number }>
      >(Prisma.sql`
        SELECT COUNT(DISTINCT c.id)::int AS carts,
               COUNT(DISTINCT c.id) FILTER (WHERE c.updated_at < ${staleBefore})::int AS "staleCarts",
               COALESCE(SUM(ci.quantity), 0)::int AS items,
               COALESCE(SUM(ci.quantity * ci.price), 0)::float AS value
        FROM carts c
        JOIN cart_items ci ON ci.cart_id = c.id
        WHERE c.updated_at >= ${gte}
      `),
      prisma.$queryRaw<
        Array<{
          id: string;
          name: string;
          slug: string;
          imageUrl: string | null;
          carts: number;
          quantity: number;
          value: number;
        }>
      >(Prisma.sql`
        SELECT p.id,
               p.name,
               p.slug,
               img.image_url AS "imageUrl",
               COUNT(DISTINCT c.id)::int AS carts,
               COALESCE(SUM(ci.quantity), 0)::int AS quantity,
               COALESCE(SUM(ci.quantity * ci.price), 0)::float AS value
        FROM carts c
        JOIN cart_items ci ON ci.cart_id = c.id
        JOIN products p ON p.id = ci.product_id
        LEFT JOIN LATERAL (
          SELECT image_url
          FROM product_images
          WHERE product_id = p.id
          ORDER BY is_primary DESC, sort_order ASC
          LIMIT 1
        ) img ON true
        WHERE c.updated_at >= ${gte}
        GROUP BY p.id, p.name, p.slug, img.image_url
        ORDER BY carts DESC, value DESC
        LIMIT ${limit}
      `),
    ]);
    const summary = summaryRows[0];
    return {
      carts: Number(summary?.carts ?? 0),
      staleCarts: Number(summary?.staleCarts ?? 0),
      items: Number(summary?.items ?? 0),
      value: Number(summary?.value ?? 0),
      topProducts: productRows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        imageUrl: r.imageUrl ?? '',
        carts: Number(r.carts),
        quantity: Number(r.quantity),
        value: Number(r.value),
      })),
    };
  },

  /**
   * Recognized store sales (real orders) in an explicit date range — used to
   * reconcile against Meta's *attributed* numbers on the ads dashboard. Uses the
   * same REVENUE_WHERE exclusions as the rest of the admin dashboard so the
   * figure matches what operators see elsewhere.
   */
  async salesForRange(sinceDate: Date, untilDate: Date) {
    const where: Prisma.OrderWhereInput = {
      ...REVENUE_WHERE,
      createdAt: { gte: sinceDate, lte: untilDate },
    };
    const [agg, orders, latest] = await Promise.all([
      prisma.order.aggregate({ _sum: { totalAmount: true }, where }),
      prisma.order.count({ where }),
      prisma.order.findFirst({
        where,
        select: { currency: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      revenue: Number(agg._sum.totalAmount ?? 0),
      orders,
      currency: latest?.currency ?? 'PKR',
    };
  },
};

// ---------- Users ----------

export const adminUsersRepo = {
  list(opts: { skip?: number; take?: number; q?: string } = {}) {
    const where: Prisma.UserWhereInput = opts.q
      ? {
          OR: [
            { email: { contains: opts.q, mode: 'insensitive' } },
            { firstName: { contains: opts.q, mode: 'insensitive' } },
            { lastName: { contains: opts.q, mode: 'insensitive' } },
          ],
        }
      : {};
    return prisma.$transaction([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: opts.skip ?? 0,
        take: opts.take ?? 50,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isVerified: true,
          createdAt: true,
          _count: { select: { orders: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);
  },

  updateRole(id: string, role: UserRole) {
    return prisma.user.update({ where: { id }, data: { role } });
  },
};

// ---------- Banners ----------

export const adminBannersRepo = {
  list() {
    return prisma.banner.findMany({ orderBy: [{ position: 'asc' }, { title: 'asc' }] });
  },
  create(data: Prisma.BannerCreateInput) {
    return prisma.banner.create({ data });
  },
  delete(id: string) {
    return prisma.banner.delete({ where: { id } });
  },
  setActive(id: string, isActive: boolean) {
    return prisma.banner.update({ where: { id }, data: { isActive } });
  },
};

// ---------- Blog ----------

export const adminBlogRepo = {
  list() {
    return prisma.blogPost.findMany({
      orderBy: [{ isPublished: 'desc' }, { publishedAt: 'desc' }],
      include: { category: { select: { name: true } } },
    });
  },
  create(data: Prisma.BlogPostCreateInput) {
    return prisma.blogPost.create({ data });
  },
  delete(id: string) {
    return prisma.blogPost.delete({ where: { id } });
  },
  setPublished(id: string, isPublished: boolean) {
    return prisma.blogPost.update({
      where: { id },
      data: { isPublished, publishedAt: isPublished ? new Date() : null },
    });
  },
};
