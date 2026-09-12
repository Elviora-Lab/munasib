/**
 * Blog (a.k.a. "Home Guides") seeder — idempotent. Run with:
 *   npx tsx prisma/seed-blog.ts            # insert/refresh as PUBLISHED
 *   PUBLISH=false npx tsx prisma/seed-blog.ts   # insert/refresh as DRAFTS
 *
 * Content is aligned to the storefront's SEO promise ("organization ideas,
 * kitchen tips, and product know-how from the Munasib team") and references
 * the store's real categories — Wardrobe & Organizers, Kitchen Accessories,
 * Home & Living, Home & Wall Decor, Mobile Accessories.
 *
 * The public post page renders `content` with `whitespace-pre-line`, so the
 * body is PLAIN TEXT: paragraphs are separated by blank lines and section
 * labels sit on their own line. No markdown (a `##` would render literally).
 *
 * Upserts by unique `slug`, so re-running refreshes copy instead of
 * duplicating. Thumbnails are left null — add them in /admin/blog.
 */
import { config as loadEnv } from 'dotenv';

// Match prisma.config.ts: .env.local first, then .env as a baseline.
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Publish live by default; `PUBLISH=false` inserts them as drafts for review.
const PUBLISH = process.env.PUBLISH !== 'false';

type Guide = {
  slug: string;
  title: string;
  seoTitle: string;
  seoDescription: string;
  /** Days before "now" to stamp publishedAt, so the index orders newest-first. */
  ageDays: number;
  content: string;
};

const GUIDES: Guide[] = [
  {
    slug: 'small-closet-multi-hole-hangers',
    title: 'Small Closet, More Space: A Guide to Multi-Hole Magic Hangers',
    seoTitle: 'Small Closet Organization: Multi-Hole Magic Hangers Guide | Munasib',
    seoDescription:
      'Reclaim wardrobe space with multi-hole folding hangers — hang more clothes in less space, sort by season, and keep knits crease-free. A practical Munasib home guide.',
    ageDays: 2,
    content: `A single rod fills up fast. Between shirts, trousers, and the "I'll wear it eventually" pile, most wardrobes run out of width long before they run out of clothes. The fix usually isn't a bigger closet — it's using the vertical space you already own.

Why a multi-hole hanger works
A folding hanger with five to fifteen holes lets you cascade garments downward instead of sideways. One hook on the rod can hold five pairs of trousers or a full outfit stack, turning a metre of rod into the equivalent of three. Because the arms fold flat, the whole thing tucks away when you don't need it.

A five-minute closet reset
Start by pulling everything off one section of the rod. Group by type — shirts with shirts, bottoms with bottoms — then load each multi-hole hanger with a single category. Hang the heaviest items in the lowest holes so the hanger balances and doesn't tip. You'll usually clear a third of your rod on the first pass.

Match the hanger to the garment
Ringed and S-shaped hangers are ideal for trousers, scarves, and belts that slide on and off. Layered pant hangers keep creases sharp without a second press. For knits, lay them flat or fold them over a wide arm — hanging heavy wool by the shoulders stretches it out of shape over time.

Keep it tidy
Rotate seasonally: send the current season to eye level and cascade the rest below. Every few months, if a garment hasn't moved off its hole, that's your cue to donate or store it. Good organization isn't about buying more — it's about making the space you have do more.

Browse space-saving hangers and closet organizers in our Wardrobe & Organizers collection.`,
  },
  {
    slug: 'kitchen-cabinet-organizing-guide',
    title: 'Kitchen Cabinet Chaos, Solved: A Room-by-Room Organizing Guide',
    seoTitle: 'Kitchen Organization Guide: Declutter Cabinets & Drawers | Munasib',
    seoDescription:
      'A step-by-step Munasib guide to taming cabinets, drawers, and the space under your sink using baskets, cabinet organizers, and simple zoning that actually lasts.',
    ageDays: 9,
    content: `A well-run kitchen isn't the one with the most gadgets — it's the one where everything has a home you can reach without moving three other things first. Here's how to get there, zone by zone.

Start by zoning, not sorting
Before you buy a single organizer, decide what each area is for. Keep cooking tools near the stove, prep bowls and boards near your main counter, and mugs and glasses near the kettle or sink. When storage follows how you actually move around the kitchen, tidiness stops being a chore.

The cabinets
Deep shelves waste their back half — things vanish behind other things. Pull-out baskets and stackable organizers bring the back forward, so a cabinet works like a drawer. Store items you reach for daily between shoulder and knee height, and send rarely used platters to the top shelf.

The drawers
Loose utensils are where order goes to die. A simple drawer divider or a set of small baskets gives spoons, whisks, and peelers a lane each. Group by task rather than by size, and you'll stop rummaging.

Under the sink
This is the hardest-working, worst-organized cabinet in the house. Work around the pipes with tiered shelves and small caddies you can lift out whole. Keep cleaning supplies in one basket so the whole kit comes out together when you need it.

Fruit, vegetables, and the odds and ends
A ventilated cabinet basket keeps produce visible and airy instead of bruising at the bottom of a bag. For the miscellaneous drawer everyone has, a few dividers turn chaos into categories.

Make it stick
The trick to staying organized is a five-minute reset at the end of the day: everything back to its zone, counters clear. A kitchen that resets easily is one you'll actually keep tidy.

Explore baskets, cabinet organizers, and drawer dividers in our Kitchen Accessories collection.`,
  },
  {
    slug: 'faucet-aerator-guide',
    title: 'Faucet Aerators 101: The Tiny Nozzle That Cuts Your Water Bill',
    seoTitle: 'What Is a Faucet Aerator? Save Water at Home | Munasib',
    seoDescription:
      'How a 360° rotating faucet aerator reduces splash and water use without losing pressure — plus how to fit one in two minutes. A Munasib product know-how guide.',
    ageDays: 16,
    content: `That little screw-on tip at the end of your tap is called an aerator, and it does more than you'd think. If yours splashes, wastes water, or you've never given it a second look, this one's for you.

What an aerator actually does
An aerator mixes air into the water stream. That turns a hard, splashy jet into a soft, even flow that feels just as strong while using noticeably less water. Less water down the drain means a smaller bill — and in a country where every rupee on utilities counts, that adds up over a year.

Why the splash matters
A bare tap fires a narrow, high-pressure stream that bounces off plates and hands and soaks the counter. An aerator widens and softens the flow so it lands where you want it. A rotating, splash-proof nozzle goes further, letting you swivel the stream to reach the corners of a deep sink or fill a tall pot at an angle.

Fitting one takes two minutes
Most aerators simply screw onto the tap's threads — no tools, no plumber. Unscrew the old tip by hand (or with a cloth for grip), check whether your tap has inside or outside threads, screw the new one on, and run the water to check for drips. That's it.

Keeping it flowing
Hard water leaves mineral deposits that clog the mesh over time. If your flow weakens, unscrew the aerator, soak it in vinegar for an hour, rinse, and refit. Do this every few months and it'll keep performing like new.

A small upgrade, a daily payoff
Few home upgrades are this cheap, this quick, and this quietly useful. You feel it every time you turn on the tap — and see it every time the bill arrives.

See our 360° rotating, splash-proof faucet aerators and other kitchen upgrades in Kitchen Accessories.`,
  },
  {
    slug: 'cable-management-home-guide',
    title: 'From Cable Clutter to Calm: Organizing Your Tech Corners',
    seoTitle: 'Cable Management at Home: Tidy Desks & Nightstands | Munasib',
    seoDescription:
      'Tame charging cables, earphones, and adapters with clips, zip cases, and wall-mounted holders. A Munasib guide to a calmer desk, nightstand, and entryway.',
    ageDays: 23,
    content: `Every home has one: the tangle of chargers, earphones, and half-forgotten cables that migrates across the desk and nightstand. Sorting it out takes less effort than you'd expect, and the calm it buys is worth it.

Corral the cables you use daily
The cables you reach for every day — phone charger, earphones — should have a fixed spot, not a pile. Small clips along the edge of your desk hold cable ends in place so they don't slither behind the table the moment you unplug. A single adhesive holder by the bed keeps your charger within arm's reach at night.

Contain the ones you travel with
Loose cables in a bag become a knot by the time you arrive. A round zipper case gives adapters, spare cables, and a power bank one home, so your whole kit travels together and unpacks in seconds. Wind each cable and secure it with a tie before it goes in — future you will be grateful.

Lift devices off the surface
Phones and controllers eat counter and desk space. A wall-mounted holder or charging dock gets them off the surface and into a spot you'll always find them. Mounted near a socket, it doubles as a tidy charging station and frees the whole desktop.

The entryway drop zone
Keys, earbuds, and a phone tend to land wherever there's room by the door. Give them a small wall rack or dish and the daily scramble to find things on your way out simply disappears.

A quick weekly reset
Once a week, coil what's come loose and return each cable to its spot. Five minutes keeps the tangle from ever coming back — and a clear surface makes the whole room feel calmer.

Find cable organizers, zip cases, and wall-mounted phone holders across our Mobile Accessories and Random Gadgets collections.`,
  },
  {
    slug: 'vertical-wall-storage-guide',
    title: 'Wall Space Is Storage Space: Decorate and Organize Vertically',
    seoTitle: 'Vertical Storage Ideas: Use Your Walls at Home | Munasib',
    seoDescription:
      'Free up counters and floors by going vertical — wall-mounted holders, hooks, and decor that doubles as storage. Organization ideas from the Munasib team.',
    ageDays: 30,
    content: `When the floor and counters fill up, look up. The walls in most homes are the largest unused storage surface you own — and putting them to work makes small rooms feel bigger without moving a single piece of furniture.

Think in vertical zones
Treat each wall as three bands: below the knee for things you rarely touch, the middle band for everyday items, and above the shoulder for display and light objects. Keeping daily-use items in the reachable middle means the wall works for you, not against you.

Storage that looks like decor
The best vertical storage doesn't read as storage at all. A wall-mounted holder for your phone, a small charging rack, or a set of decorative hooks keeps clutter off the surfaces while adding a bit of personality. Choose pieces whose shape you enjoy — a design you like earns its place on the wall.

Free the counters
Every item you lift onto the wall is a piece of counter or desk you get back. Mount a holder for the things that always end up by the sink or the bed, and watch the flat surfaces clear themselves. Clear surfaces are easier to clean and calmer to look at.

Group for rhythm, not clutter
A wall of scattered single hooks looks busy. Cluster them into small, deliberate groupings — two or three related pieces together — so the wall feels arranged rather than random. Leave breathing room between clusters.

Mount it right
Most wall-mounted pieces fix with adhesive or a couple of screws. On painted drywall, clean the spot first and press firmly; for anything holding weight, a screw into a solid point is worth the extra minute. Test with a gentle tug before you trust it with your phone.

Going vertical is the quiet trick behind every tidy small home: less on the floor, more on the wall, and a room that finally breathes.

Discover wall-mounted holders, hooks, and decor in our Home & Wall Decor and Home & Living collections.`,
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;

async function main() {
  const now = Date.now();
  let created = 0;
  let updated = 0;

  for (const g of GUIDES) {
    const publishedAt = PUBLISH ? new Date(now - g.ageDays * DAY_MS) : null;
    const existing = await prisma.blogPost.findUnique({ where: { slug: g.slug } });

    await prisma.blogPost.upsert({
      where: { slug: g.slug },
      update: {
        title: g.title,
        content: g.content,
        seoTitle: g.seoTitle,
        seoDescription: g.seoDescription,
        isPublished: PUBLISH,
        publishedAt,
      },
      create: {
        slug: g.slug,
        title: g.title,
        content: g.content,
        seoTitle: g.seoTitle,
        seoDescription: g.seoDescription,
        isPublished: PUBLISH,
        publishedAt,
      },
    });

    if (existing) updated += 1;
    else created += 1;
    // eslint-disable-next-line no-console
    console.log(
      `${existing ? 'updated' : 'created'}  ${PUBLISH ? '[live]' : '[draft]'}  ${g.slug}`,
    );
  }

  // eslint-disable-next-line no-console
  console.log(`\nDone. ${created} created, ${updated} updated, ${GUIDES.length} total.`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
