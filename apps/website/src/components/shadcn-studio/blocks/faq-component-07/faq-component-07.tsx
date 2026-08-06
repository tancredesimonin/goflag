import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

type FAQs = {
  question: string;
  answer: string;
}[];

interface FAQProps {
  title: string;
  faqItems: FAQs;
}

const FAQ = ({ title, faqItems }: FAQProps) => {
  const halfLength = Math.ceil(faqItems.length / 2);
  const firstHalf = faqItems.slice(0, halfLength);
  const secondHalf = faqItems.slice(halfLength);

  return (
    <section className="bg-muted/40 border-y py-16 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 max-w-3xl">
          <h2 className="text-3xl font-semibold text-balance md:text-4xl">{title}</h2>
        </div>

        <div className="grid grid-cols-1 gap-x-12 gap-y-6 lg:grid-cols-2">
          {[firstHalf, secondHalf].map((half, column) => (
            <Accordion
              key={column}
              type="single"
              collapsible
              className="h-fit w-full rounded-lg border"
              defaultValue={column === 0 ? "item-1" : undefined}
            >
              {half.map((item, index) => (
                <AccordionItem key={item.question} value={`item-${index + 1}`}>
                  <AccordionTrigger className="px-5 text-base">{item.question}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground px-5 text-[0.9375rem] leading-relaxed">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FAQ;
