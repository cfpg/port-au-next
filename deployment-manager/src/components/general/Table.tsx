import { tv } from 'tailwind-variants';

const table = tv({
  base: 'min-w-full divide-y divide-gray-200',
  variants: {},
  defaultVariants: {},
});

const tableHeader = tv({
  base: 'bg-gray-50',
  variants: {},
  defaultVariants: {},
});

const tableBody = tv({
  base: 'bg-white divide-y divide-gray-200',
  variants: {},
  defaultVariants: {},
});

const tableRow = tv({
  base: '',
  variants: {},
  defaultVariants: {},
});

const tableHead = tv({
  base: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider',
  variants: {},
  defaultVariants: {},
});

const tableCell = tv({
  base: 'px-6 py-4 whitespace-nowrap text-sm text-gray-500',
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