import { tv } from 'tailwind-variants';

const table = tv({
  base: 'w-full caption-bottom text-sm',
  variants: {},
  defaultVariants: {},
});

const tableHeader = tv({
  base: 'border-b bg-muted/50',
  variants: {},
  defaultVariants: {},
});

const tableBody = tv({
  base: '[&_tr:last-child]:border-0',
  variants: {},
  defaultVariants: {},
});

const tableRow = tv({
  base: 'border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted',
  variants: {},
  defaultVariants: {},
});

const tableHead = tv({
  base: 'h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0',
  variants: {},
  defaultVariants: {},
});

const tableCell = tv({
  base: 'p-4 align-middle [&:has([role=checkbox])]:pr-0',
  variants: {},
  defaultVariants: {},
});

interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  children: React.ReactNode;
}

interface TableHeaderProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  children: React.ReactNode;
}

interface TableBodyProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  children: React.ReactNode;
}

interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  children: React.ReactNode;
}

interface TableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  children: React.ReactNode;
}

interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  children: React.ReactNode;
}

export default function Table({ className, ...props }: TableProps) {
  return <table className={table({ className })} {...props} />;
}

export function TableHeader({ className, ...props }: TableHeaderProps) {
  return <thead className={tableHeader({ className })} {...props} />;
}

export function TableBody({ className, ...props }: TableBodyProps) {
  return <tbody className={tableBody({ className })} {...props} />;
}

export function TableRow({ className, ...props }: TableRowProps) {
  return <tr className={tableRow({ className })} {...props} />;
}

export function TableHead({ className, ...props }: TableHeadProps) {
  return <th className={tableHead({ className })} {...props} />;
}

export function TableCell({ className, ...props }: TableCellProps) {
  return <td className={tableCell({ className })} {...props} />;
} 