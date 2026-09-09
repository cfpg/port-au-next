"use client";

import { useMemo, useState } from 'react';
import { getServiceStatusTone } from '~/utils/serviceColors';
import Link from '~/components/general/Link';
import getSingleAppPath from '~/utils/getSingleAppPath';
import { App, ServiceStatus } from '~/types';
import AppDeployButton from '~/components/buttons/AppDeployButton';
import Badge from '~/components/general/Badge';
import Table, { TableColumn } from '~/components/general/Table';
import TableToolbar from '~/components/general/TableToolbar';
import Pagination from '~/components/general/Pagination';
import EmptyState from '~/components/general/EmptyState';
import Button from '~/components/general/Button';
import Menu from '~/components/general/Menu';
import RelativeTime from '~/components/general/RelativeTime';
import { useRouter } from 'next/navigation';

interface AppsTableProps {
  /** undefined while the initial fetch is in flight. */
  apps?: App[];
}

const PAGE_SIZE = 10;

const STATUS_FILTERS = [
  { key: 'all', label: 'all' },
  { key: 'active', label: 'active' },
  { key: 'building', label: 'building' },
  { key: 'inactive', label: 'inactive' },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]['key'];

function matchesStatusFilter(status: string, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  const s = status.toLowerCase();
  if (filter === 'active') return ['running', 'success', 'active'].includes(s);
  if (filter === 'building') return ['pending', 'building', 'preflight', 'migrating'].includes(s);
  return !['running', 'success', 'active', 'pending', 'building', 'preflight', 'migrating'].includes(s);
}

export default function AppsTable({ apps }: AppsTableProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortDescending, setSortDescending] = useState(false);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!apps) return [];
    const q = query.trim().toLowerCase();
    return apps
      .filter((app) => matchesStatusFilter(app.status, statusFilter))
      .filter((app) => !q || app.name.toLowerCase().includes(q) || app.domain?.toLowerCase().includes(q) || app.repo_url.toLowerCase().includes(q))
      .sort((a, b) => (sortDescending ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name)));
  }, [apps, query, statusFilter, sortDescending]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleSearchChange = (value: string) => {
    setQuery(value);
    setPage(1);
  };

  const handleFilterChange = (key: string) => {
    setStatusFilter(key as StatusFilter);
    setPage(1);
  };

  const clearFilters = () => {
    setQuery('');
    setStatusFilter('all');
    setPage(1);
  };

  const columns: TableColumn<App>[] = [
    {
      key: 'name',
      header: 'name',
      width: '1.5fr',
      sortable: true,
      render: (app) => (
        <div className="min-w-0">
          <Link href={getSingleAppPath(app.name)} variant="default" className="block truncate">{app.name}</Link>
          <div className="font-mono text-micro text-ink-faint mt-2 truncate">{app.repo_url}</div>
        </div>
      ),
    },
    {
      key: 'branch',
      header: 'branch',
      width: '0.7fr',
      render: (app) => <span className="font-mono text-meta text-ink-muted">{app.branch}</span>,
    },
    {
      key: 'domain',
      header: 'domain',
      width: '1.2fr',
      render: (app) =>
        app.domain ? (
          <a href={`https://${app.domain}`} target="_blank" rel="noopener noreferrer" className="font-mono text-meta underline decoration-primary-line underline-offset-2 truncate block">
            {app.domain}
          </a>
        ) : (
          <span className="font-mono text-meta text-ink-ghost">Not set</span>
        ),
    },
    {
      key: 'status',
      header: 'status',
      width: '0.85fr',
      render: (app) => (
        <Badge tone={getServiceStatusTone(app.status as ServiceStatus)} withDot>{app.status}</Badge>
      ),
    },
    {
      key: 'lastDeployment',
      header: 'last deployment',
      width: '1.9fr',
      render: (app) =>
        app.last_deployment ? (
          <RelativeTime value={String(app.last_deployment.deployed_at)} showRelative />
        ) : (
          <span className="font-mono text-meta text-ink-ghost">Never</span>
        ),
    },
    {
      key: 'actions',
      header: 'actions',
      width: '88px',
      align: 'right',
      render: (app) => (
        <>
          <AppDeployButton app={app} showDropdown={true} />
          <Menu
            ariaLabel={`More actions for ${app.name}`}
            items={[
              { label: 'Settings', icon: <i className="fas fa-gear text-ink-muted" />, onClick: () => router.push(getSingleAppPath(app.name)) },
            ]}
          />
        </>
      ),
    },
  ];

  return (
    <div>
      <TableToolbar
        searchValue={query}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Filter apps…"
        filters={[...STATUS_FILTERS]}
        activeFilter={statusFilter}
        onFilterChange={handleFilterChange}
        resultLabel={apps ? `${filtered.length} app${filtered.length === 1 ? '' : 's'}` : undefined}
      />
      <Table
        columns={columns}
        rows={pageRows}
        rowKey={(app) => app.id}
        sortKey="name"
        sortDescending={sortDescending}
        onSortChange={() => {
          setSortDescending((v) => !v);
          setPage(1);
        }}
        isLoading={!apps}
        emptyState={
          <EmptyState
            title={`No apps match “${query}”`}
            action={<Button variant="secondary" size="sm" onClick={clearFilters}>Clear filters</Button>}
          />
        }
      />
      {apps && pageCount > 1 ? (
        <Pagination
          pageLabel={`${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filtered.length)} of ${filtered.length}`}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(pageCount, p + 1))}
          hasPrev={currentPage > 1}
          hasNext={currentPage < pageCount}
        />
      ) : null}
    </div>
  );
}
