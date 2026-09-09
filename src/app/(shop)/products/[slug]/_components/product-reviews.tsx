import Image from 'next/image';
import { BadgeCheck } from 'lucide-react';

import { formatDate } from '@/utils/format';

import { Rating } from '@/design-system/primitives/rating';

import { ReviewForm } from './review-form';

type ReviewRow = {
  id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  isVerifiedPurchase: boolean;
  /** ISO string from cached PDP DTO, or Date from legacy callers. */
  createdAt: string | Date;
  authorName: string | null;
  user: { firstName: string | null; lastName: string | null } | null;
  images: { id: string; imageUrl: string }[];
};

function authorName(r: Pick<ReviewRow, 'user' | 'authorName'>) {
  // Logged-in reviewer → "First L."; guest verified-purchase → shipping name;
  // else a neutral fallback.
  if (r.user) {
    const first = r.user.firstName?.trim() || 'Anonymous';
    const lastInitial = r.user.lastName?.trim()?.[0];
    return lastInitial ? `${first} ${lastInitial}.` : first;
  }
  const guest = r.authorName?.trim();
  if (!guest) return 'Verified buyer';
  // Show first name + last initial only, for privacy.
  const [first, ...rest] = guest.split(/\s+/);
  const lastInitial = rest.length ? rest[rest.length - 1]?.[0] : undefined;
  return lastInitial ? `${first} ${lastInitial}.` : (first ?? 'Verified buyer');
}

export function ProductReviews({
  productId,
  summary,
  reviews,
}: {
  productId: string;
  summary: { average: number; count: number };
  reviews: ReviewRow[];
}) {
  return (
    <section id="reviews" className="flex flex-col gap-6 border-t border-border/60 pt-10">
      <header className="flex flex-col gap-2">
        <span className="eyebrow">Reviews</span>
        <div className="flex items-center gap-3">
          <h2 className="editorial-heading text-display-sm">
            {summary.count > 0 ? summary.average.toFixed(1) : 'No reviews yet'}
          </h2>
          {summary.count > 0 ? (
            <Rating value={summary.average} reviewCount={summary.count} size={16} />
          ) : null}
        </div>
        {summary.count > 0 ? (
          <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <BadgeCheck className="size-4 text-success" aria-hidden />
            Reviews from customers who received their orders.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Delivered customers can leave a verified review here.
          </p>
        )}
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        {/* List */}
        <div className="flex flex-col gap-6">
          {reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">Be the first to review this product.</p>
          ) : (
            reviews.map((r) => (
              <article key={r.id} className="flex flex-col gap-1.5 border-b border-border/50 pb-5">
                <div className="flex items-center gap-2">
                  <Rating value={r.rating} size={13} />
                  {r.isVerifiedPurchase ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-success">
                      <BadgeCheck className="size-3.5" /> Verified
                    </span>
                  ) : null}
                </div>
                {r.title ? <h3 className="text-sm font-medium">{r.title}</h3> : null}
                {r.comment ? (
                  <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
                    {r.comment}
                  </p>
                ) : null}
                {r.images.length > 0 ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {r.images.map((image) => (
                      <a
                        key={image.id}
                        href={image.imageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="relative block size-20 overflow-hidden rounded-md border border-border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`View photo shared by ${authorName(r)}`}
                      >
                        <Image
                          src={image.imageUrl}
                          alt="Photo shared with this review"
                          fill
                          sizes="80px"
                          className="object-cover"
                        />
                      </a>
                    ))}
                  </div>
                ) : null}
                <p className="text-xs text-muted-foreground/80">
                  {authorName(r)} · {formatDate(r.createdAt, { dateStyle: 'medium' })}
                </p>
              </article>
            ))
          )}
        </div>

        {/* Write form */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <ReviewForm productId={productId} />
        </div>
      </div>
    </section>
  );
}
