interface CardGridProps {
  title: string;
  cards: React.ReactNode[];
}

export default function CardGrid({ title, cards }: CardGridProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {cards}
      </div>
    </div>
  );
} 