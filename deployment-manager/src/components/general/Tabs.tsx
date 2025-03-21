import { tv } from 'tailwind-variants';

const tabs = tv({
  base: 'w-full',
  variants: {},
  defaultVariants: {},
});

const tabsList = tv({
  base: 'inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground',
  variants: {},
  defaultVariants: {},
});

const tabsTrigger = tv({
  base: 'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
  variants: {},
  defaultVariants: {},
});

const tabsContent = tv({
  base: 'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  variants: {},
  defaultVariants: {},
});

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultValue?: string;
  children: React.ReactNode;
}

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

export default function Tabs({ className, ...props }: TabsProps) {
  return <div className={tabs({ className })} {...props} />;
}

export function TabsList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={tabsList({ className })} role="tablist" {...props} />;
}

export function TabsTrigger({ className, ...props }: TabsTriggerProps) {
  return <button className={tabsTrigger({ className })} role="tab" {...props} />;
}

export function TabsContent({ className, ...props }: TabsContentProps) {
  return <div className={tabsContent({ className })} role="tabpanel" {...props} />;
} 