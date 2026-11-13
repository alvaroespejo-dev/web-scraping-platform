import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, tokens } from './client';
import type {
  Execution,
  ExecutionLog,
  MonitoringSummary,
  Paged,
  PreviewResult,
  ScrapedItem,
  Site,
  SiteForm,
} from './types';

const isActive = (status?: string) => status === 'QUEUED' || status === 'RUNNING';

export function useSites() {
  return useQuery({ queryKey: ['sites'], queryFn: () => api<Site[]>('/sites') });
}

export function useSite(id: string | undefined) {
  return useQuery({
    queryKey: ['sites', id],
    queryFn: () => api<Site>(`/sites/${id}`),
    enabled: !!id,
  });
}

export function useSaveSite(id?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SiteForm) =>
      id ? api<Site>(`/sites/${id}`, { method: 'PUT', body: JSON.stringify(body) }) : api<Site>('/sites', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sites'] }),
  });
}

export function useDeleteSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/sites/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sites'] }),
  });
}

export function useSetSchedule(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cron: string | null) =>
      api<Site>(`/sites/${siteId}/schedule`, { method: 'PATCH', body: JSON.stringify({ cron }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sites', siteId] }),
  });
}

export function usePreview() {
  return useMutation({
    mutationFn: (site: SiteForm) =>
      api<PreviewResult>('/sites/preview', { method: 'POST', body: JSON.stringify({ site, maxItems: 10 }) }),
  });
}

export function useRunSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (siteId: string) => api<Execution>(`/sites/${siteId}/run`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['executions'] }),
  });
}

export interface ExecutionFilters {
  siteId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export function useExecutions(filters: ExecutionFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => v !== undefined && v !== '' && params.set(k, String(v)));
  return useQuery({
    queryKey: ['executions', filters],
    queryFn: () => api<Paged<Execution>>(`/executions?${params}`),
    refetchInterval: (q) => (q.state.data?.items.some((e) => isActive(e.status)) ? 3000 : false),
  });
}

export function useExecution(id: string | undefined) {
  return useQuery({
    queryKey: ['executions', 'detail', id],
    queryFn: () => api<Execution>(`/executions/${id}`),
    enabled: !!id,
    refetchInterval: (q) => (isActive(q.state.data?.status) ? 2000 : false),
  });
}

export function useExecutionLogs(id: string | undefined, live: boolean) {
  return useQuery({
    queryKey: ['executions', 'logs', id],
    queryFn: () => api<ExecutionLog[]>(`/executions/${id}/logs`),
    enabled: !!id,
    refetchInterval: live ? 2000 : false,
  });
}

export function useCancelExecution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<Execution>(`/executions/${id}/cancel`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['executions'] }),
  });
}

export interface ResultFilters {
  siteId?: string;
  executionId?: string;
  q?: string;
  field?: string;
  page?: number;
  pageSize?: number;
}

export function useResults(filters: ResultFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => v !== undefined && v !== '' && params.set(k, String(v)));
  return useQuery({
    queryKey: ['results', filters],
    queryFn: () => api<Paged<ScrapedItem>>(`/results?${params}`),
  });
}

export function useMonitoring(days = 30) {
  return useQuery({
    queryKey: ['monitoring', days],
    queryFn: () => api<MonitoringSummary>(`/monitoring/summary?days=${days}`),
    refetchInterval: 15_000,
  });
}

export const hasSession = () => !!tokens.access();
