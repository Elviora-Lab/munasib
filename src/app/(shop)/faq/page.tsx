import Link from 'next/link';

import { buildMetadata, faqJsonLd, JsonLd } from '@/lib/seo';

import { Section, SectionHeading } from '@/design-system/primitives/section';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

export const metadata = buildMetadata({
  title: 'FAQ',
  description:
    'Answers to the questions we hear most — delivery, returns, payments, and product care at Munasib.',
  path: '/faq',
});

// Single source of truth: renders the accordion AND feeds the FAQPage schema.
// `answer` is the plain-text answer (used for both); `link` is an optional
// follow-up internal link shown under the answer.
const FAQS: {
  id: string;
  question: string;
  answer: string;
  link?: { href: string; label: string };
}[] = [
  {
    id: 'shipping',
    question: 'How long does delivery take?',
    answer:
      'Orders within Pakistan are typically delivered in 2 to 5 business days. We offer complimentary shipping on orders over Rs 3,300.',
  },
  {
    id: 'returns',
    question: 'What is your returns policy?',
    answer: 'Unopened products may be returned within 2 to 3 days of delivery for a full refund.',
    link: { href: '/shipping', label: 'Shipping & returns details' },
  },
  {
    id: 'payment',
    question: 'Which payment methods do you accept?',
    answer:
      'We accept major debit and credit cards as well as cash on delivery across Pakistan. All prices are shown in Pakistani Rupees (Rs).',
  },
  {
    id: 'authenticity',
    question: 'Are your products authentic?',
    answer:
      'Every product sold on Munasib is sourced directly and quality-checked before dispatch, with materials and care details on each listing.',
  },
  {
    id: 'order',
    question: 'How do I track my order?',
    answer: 'Sign in to your account to view live order status and your full purchase history.',
    link: { href: '/account', label: 'Go to your account' },
  },
];

export default function FaqPage() {
  return (
    <Section>
      <JsonLd data={faqJsonLd(FAQS.map((f) => ({ question: f.question, answer: f.answer })))} />
      <div className="container flex max-w-3xl flex-col gap-10">
        <SectionHeading
          as="h1"
          eyebrow="Help centre"
          title="Frequently asked questions"
          description="The essentials, gathered in one place. Need something more specific? Our team is one message away."
        />

        <Accordion type="single" collapsible defaultValue={FAQS[0]?.id}>
          {FAQS.map((faq) => (
            <AccordionItem key={faq.id} value={faq.id}>
              <AccordionTrigger>{faq.question}</AccordionTrigger>
              <AccordionContent>
                {faq.answer}
                {faq.link ? (
                  <>
                    {' '}
                    <Link
                      className="text-foreground underline underline-offset-4"
                      href={faq.link.href}
                    >
                      {faq.link.label}
                    </Link>
                    .
                  </>
                ) : null}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </Section>
  );
}
