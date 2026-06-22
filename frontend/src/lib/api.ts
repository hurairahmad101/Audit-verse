import axios, { AxiosError, AxiosInstance, AxiosResponse } from 'axios';

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  display_name: string;
  department?: string;
  group?: string;
  division?: string;
  designation?: string;
  is_active: boolean;
  created_at: string;
  last_login: string | null;
  roles: { id: number; name: string }[];
}

export interface AdminRole {
  id: number;
  name: string;
  description: string;
  is_system_role: boolean;
  user_count: number;
  permissions: string[];
  created_at: string;
}

export interface OrganizationProfile {
  id: number | null;
  name: string;
  legal_entity?: string;
  industry?: string;
  company_size?: string;
  geography?: string;
  regulatory_scope?: string;
  primary_contact_name?: string;
  primary_contact_email?: string;
  primary_contact_phone?: string;
  address?: string;
  website?: string;
  logo_url?: string;
  settings?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface PermissionModule {
  module: string;
  display_name: string;
  submodules: {
    name: string;
    display_name: string;
    actions: string[];
  }[];
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api';

const getTenantSlugFromHost = (): string | null => {
  if (typeof window === 'undefined') return null;
  const host = window.location.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1') return null;
  if (host.endsWith('.localhost')) {
    const parts = host.split('.');
    if (parts.length === 2) return parts[0];
  }
  const parts = host.split('.');
  if (parts.length >= 3) return parts[0];
  return null;
};

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 900000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export { apiClient };

apiClient.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      const hostTenant = getTenantSlugFromHost();
      const tenantSlug = hostTenant || localStorage.getItem('tenant_slug');
      if (hostTenant) {
        localStorage.setItem('tenant_slug', hostTenant);
      }
      if (tenantSlug) {
        config.headers['X-Tenant-Slug'] = tenantSlug;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.clear();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const assetsApi = {
  getTenantUsers: () => apiClient.get<Array<{id: number; display_name: string; email: string}>>('/assets/tenant-users'),
};

export const adminApi = {
  getOrganization: () => apiClient.get<OrganizationProfile>('/admin/organization'),
  updateOrganization: (data: Partial<OrganizationProfile>) =>
    apiClient.put('/admin/organization', data),

  getUsers: () => apiClient.get<AdminUser[]>('/admin/users'),
  getUser: (id: number) => apiClient.get<AdminUser>(`/admin/users/${id}`),
  createUser: (data: {
    username: string;
    email: string;
    password: string;
    display_name?: string;
    department?: string;
    group?: string;
    division?: string;
    designation?: string;
    role_ids?: number[]
  }) => apiClient.post('/admin/users', data),
  updateUser: (id: number, data: {
    display_name?: string;
    email?: string;
    department?: string;
    group?: string;
    division?: string;
    designation?: string;
    is_active?: boolean;
    role_ids?: number[]
  }) => apiClient.put(`/admin/users/${id}`, data),
  deleteUser: (id: number) => apiClient.delete(`/admin/users/${id}`),

  getRoles: () => apiClient.get<AdminRole[]>('/admin/roles'),
  getRole: (id: number) => apiClient.get<AdminRole>(`/admin/roles/${id}`),
  createRole: (data: {
    name: string;
    description?: string;
    permission_names: string[]
  }) => apiClient.post('/admin/roles', data),
  updateRole: (id: number, data: {
    name?: string;
    description?: string;
    permission_names?: string[]
  }) => apiClient.put(`/admin/roles/${id}`, data),
  deleteRole: (id: number) => apiClient.delete(`/admin/roles/${id}`),

  getPermissions: () => apiClient.get<{ name: string; module: string; submodule: string; action: string; description: string }[]>('/admin/permissions'),
  getPermissionMatrix: () => apiClient.get<PermissionModule[]>('/admin/permissions/matrix'),

  getAuditLogs: (params?: { limit?: number; offset?: number; action?: string; module?: string; user_id?: number; start_date?: string; end_date?: string }) =>
    apiClient.get('/admin/audit-logs', { params }),
  getAuditLogFilters: () => apiClient.get<{ actions: string[]; modules: string[]; date_presets: string[] }>('/admin/audit-logs/filters'),
};

export const tenantAuthApi = {
  login: (data: { username: string; password: string }, subdomain: string) =>
    apiClient.post('/auth/tenant-login', data, { params: { subdomain } }),
  getMe: () => apiClient.get('/auth/tenant-me'),
  registerOrganization: (data: {
    email: string;
    password: string;
    display_name: string;
    organization_name: string;
    legal_entity?: string;
    industry?: string;
    regulatory_scope?: string;
    company_size?: string;
    geography?: string;
    primary_contact_phone?: string;
  }) => apiClient.post('/auth/register-organization', data),
};

export const auditApi = {
  universe: {
    getAll: (params?: Record<string, unknown>) => apiClient.get('/audit/universe', { params }),
    getById: (id: number) => apiClient.get(`/audit/universe/${id}`),
    create: (data: Record<string, unknown>) => apiClient.post('/audit/universe', data),
    update: (id: number, data: Record<string, unknown>) => apiClient.put(`/audit/universe/${id}`, data),
    delete: (id: number) => apiClient.delete(`/audit/universe/${id}`),
    getCoverageGaps: () => apiClient.get('/audit/universe/coverage-gaps'),
    getRiskEnrichment: () => apiClient.get('/audit/universe/risk-enrichment'),
    syncFromRisks: () => apiClient.post('/audit/universe/sync-from-risks'),
    refreshRiskScores: () => apiClient.post('/audit/universe/refresh-risk-scores'),
    generateDescription: (data: Record<string, unknown>) => apiClient.post('/audit/universe/generate-description', data),
    downloadImportTemplate: () => apiClient.get('/audit/universe/import/template', { responseType: 'blob' }),
    previewImport: (file: File, mapping?: Record<string, string | null>) => {
      const formData = new FormData();
      formData.append('file', file);
      if (mapping) formData.append('mapping', JSON.stringify(mapping));
      return apiClient.post('/audit/universe/import/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    commitImport: (file: File, mapping?: Record<string, string | null>) => {
      const formData = new FormData();
      formData.append('file', file);
      if (mapping) formData.append('mapping', JSON.stringify(mapping));
      return apiClient.post('/audit/universe/import/commit', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
  },
  scoring: {
    getConfig: () => apiClient.get('/audit/scoring/config'),
    updateConfig: (data: Record<string, unknown>) => apiClient.put('/audit/scoring/config', data),
    run: (entityId?: number) => apiClient.post('/audit/scoring/run', undefined, entityId ? { params: { entity_id: entityId } } : undefined),
    getEntityBreakdown: (entityId: number) => apiClient.get(`/audit/scoring/entity/${entityId}`),
    updateFactors: (entityId: number, data: Record<string, unknown>) => apiClient.put(`/audit/scoring/entity/${entityId}/factors`, data),
    setOverride: (entityId: number, data: Record<string, unknown>) => apiClient.post(`/audit/scoring/entity/${entityId}/override`, data),
    clearOverride: (entityId: number) => apiClient.delete(`/audit/scoring/entity/${entityId}/override`),
    getHistory: (entityId: number, limit?: number) => apiClient.get(`/audit/scoring/entity/${entityId}/history`, limit ? { params: { limit } } : undefined),
    getNarrative: (entityId: number) => apiClient.get(`/audit/scoring/entity/${entityId}/narrative`),
    aiAssess: (entityId: number) => apiClient.post(`/audit/scoring/entity/${entityId}/ai-assess`),
  },
  riskRegister: {
    getAll: (params?: Record<string, unknown>) => apiClient.get('/audit/risk-register', { params }),
    getById: (id: number) => apiClient.get(`/audit/risk-register/${id}`),
    create: (data: Record<string, unknown>) => apiClient.post('/audit/risk-register', data),
    update: (id: number, data: Record<string, unknown>) => apiClient.put(`/audit/risk-register/${id}`, data),
    delete: (id: number) => apiClient.delete(`/audit/risk-register/${id}`),
  },
  plans: {
    getAll: (params?: Record<string, unknown>) => apiClient.get('/audit/plans', { params }),
    getById: (id: number) => apiClient.get(`/audit/plans/${id}`),
    create: (data: Record<string, unknown>) => apiClient.post('/audit/plans', data),
    update: (id: number, data: Record<string, unknown>) => apiClient.put(`/audit/plans/${id}`, data),
    delete: (id: number) => apiClient.delete(`/audit/plans/${id}`),
    approve: (id: number, data: Record<string, unknown>) => apiClient.post(`/audit/plans/${id}/approve`, data),
    previewFromUniverse: (data: Record<string, unknown>) => apiClient.post('/audit/plans/generate-from-universe/preview', data),
    generateFromUniverse: (data: Record<string, unknown>) => apiClient.post('/audit/plans/generate-from-universe', data),
    addItem: (planId: number, data: Record<string, unknown>) => apiClient.post(`/audit/plans/${planId}/items`, data),
    updateItem: (planId: number, itemId: number, data: Record<string, unknown>) => apiClient.put(`/audit/plans/${planId}/items/${itemId}`, data),
    deleteItem: (planId: number, itemId: number) => apiClient.delete(`/audit/plans/${planId}/items/${itemId}`),
    getCalendar: (planId: number) => apiClient.get(`/audit/plans/${planId}/calendar`),
    getRegulatoryImpact: (params?: Record<string, unknown>) => apiClient.get('/audit/plans/regulatory-impact', { params }),
  },
  engagements: {
    getAll: (params?: Record<string, unknown>) => apiClient.get('/audit/engagements', { params }),
    getById: (id: number) => apiClient.get(`/audit/engagements/${id}`),
    create: (data: Record<string, unknown>) => apiClient.post('/audit/engagements', data),
    update: (id: number, data: Record<string, unknown>) => apiClient.put(`/audit/engagements/${id}`, data),
    delete: (id: number) => apiClient.delete(`/audit/engagements/${id}`),
    transition: (id: number, data: Record<string, unknown>) => apiClient.post(`/audit/engagements/${id}/transition`, data),
    createFromPlanItem: (data: Record<string, unknown>) => apiClient.post('/audit/engagements/from-plan-item', data),
    createFromPlan: (planId: number) => apiClient.post('/audit/engagements/from-plan', undefined, { params: { plan_id: planId } }),
    getResourceCalendar: (params?: Record<string, unknown>) => apiClient.get('/audit/engagements/resource-calendar', { params }),
    getPriorAudits: (id: number) => apiClient.get(`/audit/engagements/${id}/prior-audits`),
    getSamplingRecords: (id: number) => apiClient.get(`/audit/engagements/${id}/sampling-records`),
    saveSamplingRecord: (id: number, data: Record<string, unknown>) => apiClient.post(`/audit/engagements/${id}/sampling-records`, data),
    deleteSamplingRecord: (id: number, recordId: number) => apiClient.delete(`/audit/engagements/${id}/sampling-records/${recordId}`),
    addTeamMember: (id: number, data: Record<string, unknown>) => apiClient.post(`/audit/engagements/${id}/team`, data),
    removeTeamMember: (id: number, memberId: number) => apiClient.delete(`/audit/engagements/${id}/team/${memberId}`),
    addTimeEntry: (id: number, data: Record<string, unknown>) => apiClient.post(`/audit/engagements/${id}/time-entries`, data),
    deleteTimeEntry: (id: number, entryId: number) => apiClient.delete(`/audit/engagements/${id}/time-entries/${entryId}`),
    getRiskGuidance: (id: number) => apiClient.get(`/audit/engagements/${id}/risk-guidance`),
  },
  workpapers: {
    getAll: (params?: Record<string, unknown>) => apiClient.get('/audit/workpapers', { params }),
    getById: (id: number) => apiClient.get(`/audit/workpapers/${id}`),
    create: (data: Record<string, unknown>) => apiClient.post('/audit/workpapers', data),
    update: (id: number, data: Record<string, unknown>) => apiClient.put(`/audit/workpapers/${id}`, data),
    delete: (id: number) => apiClient.delete(`/audit/workpapers/${id}`),
    signoff: (id: number, data: Record<string, unknown>) => apiClient.post(`/audit/workpapers/${id}/signoff`, data),
    addProcedure: (workpaperId: number, data: Record<string, unknown>) => apiClient.post(`/audit/workpapers/${workpaperId}/procedures`, data),
    updateProcedure: (workpaperId: number, procedureId: number, data: Record<string, unknown>) => apiClient.put(`/audit/workpapers/${workpaperId}/procedures/${procedureId}`, data),
  },
  findings: {
    getAll: (params?: Record<string, unknown>) => apiClient.get('/audit/findings', { params }),
    getById: (id: number) => apiClient.get(`/audit/findings/${id}`),
    create: (data: Record<string, unknown>) => apiClient.post('/audit/findings', data),
    downloadTemplate: () => apiClient.get('/audit/findings/template/download', { responseType: 'blob' }),
    importFile: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiClient.post('/audit/findings/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    createWithAttachment: (data: FormData) => apiClient.post('/audit/findings/with-attachment', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
    suggestDetails: (data: Record<string, unknown>) => apiClient.post('/audit/findings/ai-suggest', data),
    getSeveritySuggestion: (engagementId: number) => apiClient.get('/audit/findings/severity-suggestion', { params: { engagement_id: engagementId } }),
    getGroupedByEngagement: (params?: Record<string, unknown>) => apiClient.get('/audit/findings/grouped-by-engagement', { params }),
    update: (id: number, data: Record<string, unknown>) => apiClient.put(`/audit/findings/${id}`, data),
    delete: (id: number) => apiClient.delete(`/audit/findings/${id}`),
    getOverdue: () => apiClient.get('/audit/findings/overdue'),
    getThemes: () => apiClient.get('/audit/findings/themes'),
    suggestRootCause: (id: number) => apiClient.post(`/audit/findings/${id}/ai-root-cause`),
    addManagementResponse: (findingId: number, data: Record<string, unknown>) => apiClient.post(`/audit/findings/${findingId}/management-response`, data),
    addRecommendation: (findingId: number, data: Record<string, unknown>) => apiClient.post(`/audit/findings/${findingId}/recommendations`, data),
    addActionPlan: (findingId: number, recId: number, data: Record<string, unknown>) => apiClient.post(`/audit/findings/${findingId}/recommendations/${recId}/action-plans`, data),
    updateActionPlan: (findingId: number, recId: number, apId: number, data: Record<string, unknown>) => apiClient.put(`/audit/findings/${findingId}/recommendations/${recId}/action-plans/${apId}`, data),
    addFollowUp: (findingId: number, data: Record<string, unknown>) => apiClient.post(`/audit/findings/${findingId}/follow-ups`, data),
    closeFollowUp: (findingId: number, fuId: number, data?: Record<string, unknown>) => apiClient.post(`/audit/findings/${findingId}/follow-ups/${fuId}/close`, data || {}),
  },
  ccm: {
    getRules: (params?: Record<string, unknown>) => apiClient.get('/audit/ccm/rules', { params }),
    createRule: (data: Record<string, unknown>) => apiClient.post('/audit/ccm/rules', data),
    updateRule: (id: number, data: Record<string, unknown>) => apiClient.put(`/audit/ccm/rules/${id}`, data),
    deleteRule: (id: number) => apiClient.delete(`/audit/ccm/rules/${id}`),
    getAnomalies: (params?: Record<string, unknown>) => apiClient.get('/audit/ccm/anomalies', { params }),
    createAnomaly: (data: Record<string, unknown>) => apiClient.post('/audit/ccm/anomalies', data),
    reviewAnomaly: (id: number, data: Record<string, unknown>) => apiClient.post(`/audit/ccm/anomalies/${id}/review`, data),
    getStats: () => apiClient.get('/audit/ccm/stats'),
  },
  reporting: {
    getReports: (params?: Record<string, unknown>) => apiClient.get('/audit/reporting/reports', { params }),
    createReport: (data: Record<string, unknown>) => apiClient.post('/audit/reporting/reports', data),
    updateReport: (id: number, data: Record<string, unknown>) => apiClient.put(`/audit/reporting/reports/${id}`, data),
    getFullReport: (id: number) => apiClient.get(`/audit/reporting/reports/${id}/full`),
    exportPDF: (id: number) => apiClient.get(`/audit/reporting/reports/${id}/export/pdf`, { responseType: 'blob' }),
    exportDOCX: (id: number) => apiClient.get(`/audit/reporting/reports/${id}/export/docx`, { responseType: 'blob' }),
    getBoardPacks: () => apiClient.get('/audit/reporting/board-packs'),
    createBoardPack: (data: Record<string, unknown>) => apiClient.post('/audit/reporting/board-packs', data),
    getKPIs: () => apiClient.get('/audit/reporting/kpis'),
    getTrendAnalysis: (params?: Record<string, unknown>) => apiClient.get('/audit/reporting/trend-analysis', { params }),
    getRiskPrioritization: () => apiClient.get('/audit/reporting/risk-prioritization'),
    getRiskBasedReport: (fiscalYear?: string) => apiClient.get('/audit/reporting/risk-based-report', fiscalYear ? { params: { fiscal_year: fiscalYear } } : undefined),
    exportRiskBasedReportDOCX: (fiscalYear?: string) => apiClient.get('/audit/reporting/risk-based-report/export/docx', { responseType: 'blob', ...(fiscalYear ? { params: { fiscal_year: fiscalYear } } : {}) }),
    getAccountability: () => apiClient.get('/audit/reporting/accountability'),
    getROIMetrics: (hourlyRate?: number) => apiClient.get('/audit/reporting/roi-metrics', { params: hourlyRate ? { hourly_rate: hourlyRate } : {} }),
    getRegulatoryImpactTracker: () => apiClient.get('/audit/reporting/regulatory-impact-tracker'),
    downloadStoryboardPDF: () => apiClient.get('/audit/reporting/storyboard-pdf', { responseType: 'blob' }),
    getPBC: (params?: Record<string, unknown>) => apiClient.get('/audit/reporting/pbc', { params }),
    createPBCItem: (data: Record<string, unknown>) => apiClient.post('/audit/reporting/pbc', data),
    updatePBCItem: (id: number, data: Record<string, unknown>) => apiClient.put(`/audit/reporting/pbc/${id}`, data),
  },
  qaip: {
    getReviews: (params?: Record<string, unknown>) => apiClient.get('/audit/qaip/reviews', { params }),
    createReview: (data: Record<string, unknown>) => apiClient.post('/audit/qaip/reviews', data),
    updateReview: (id: number, data: Record<string, unknown>) => apiClient.put(`/audit/qaip/reviews/${id}`, data),
    getIIAStandards: () => apiClient.get('/audit/qaip/iia-standards'),
    getConformance: () => apiClient.get('/audit/qaip/conformance'),
    getMaturity: () => apiClient.get('/audit/qaip/maturity'),
    getTemplates: () => apiClient.get('/audit/qaip/templates'),
    createTemplate: (data: Record<string, unknown>) => apiClient.post('/audit/qaip/templates', data),
    updateTemplate: (id: number, data: Record<string, unknown>) => apiClient.put(`/audit/qaip/templates/${id}`, data),
    deleteTemplate: (id: number) => apiClient.delete(`/audit/qaip/templates/${id}`),
    applyTemplate: (templateId: number, engagementId: number) => apiClient.post(`/audit/qaip/templates/${templateId}/apply/${engagementId}`),
  },
  testScripts: {
    getAll: (params?: Record<string, unknown>) => apiClient.get('/audit/test-scripts', { params }),
    getById: (id: number) => apiClient.get(`/audit/test-scripts/${id}`),
    create: (data: Record<string, unknown>) => apiClient.post('/audit/test-scripts', data),
    generateFromEngagement: (data: Record<string, unknown>) => apiClient.post('/audit/test-scripts/generate-from-engagement', data),
    update: (id: number, data: Record<string, unknown>) => apiClient.put(`/audit/test-scripts/${id}`, data),
    delete: (id: number) => apiClient.delete(`/audit/test-scripts/${id}`),
    cloneToEngagement: (id: number, data: Record<string, unknown>) => apiClient.post(`/audit/test-scripts/${id}/clone-to-engagement`, data),
  },
  skillMatrix: {
    getAll: (params?: Record<string, unknown>) => apiClient.get('/audit/skill-matrix', { params }),
    getByUser: (userId: number) => apiClient.get(`/audit/skill-matrix/user/${userId}`),
    createSkill: (data: Record<string, unknown>) => apiClient.post('/audit/skill-matrix', data),
    updateSkill: (id: number, data: Record<string, unknown>) => apiClient.put(`/audit/skill-matrix/${id}`, data),
    deleteSkill: (id: number) => apiClient.delete(`/audit/skill-matrix/${id}`),
    upsertProfile: (data: Record<string, unknown>) => apiClient.put('/audit/skill-matrix/profile/upsert', data),
    match: (params?: Record<string, unknown>) => apiClient.get('/audit/skill-matrix/match', { params }),
    getStats: () => apiClient.get('/audit/skill-matrix/stats'),
  },
  capacity: {
    getCalendar: (params?: Record<string, unknown>) => apiClient.get('/audit/capacity/calendar', { params }),
    getUtilization: (params?: Record<string, unknown>) => apiClient.get('/audit/capacity/utilization', { params }),
    getConflicts: (params?: Record<string, unknown>) => apiClient.get('/audit/capacity/conflicts', { params }),
  },
  notifications: {
    getTemplates: () => apiClient.get('/audit/notifications/templates'),
    createTemplate: (data: Record<string, unknown>) => apiClient.post('/audit/notifications/templates', data),
    updateTemplate: (id: number, data: Record<string, unknown>) => apiClient.put(`/audit/notifications/templates/${id}`, data),
    deleteTemplate: (id: number) => apiClient.delete(`/audit/notifications/templates/${id}`),
    seedDefaults: () => apiClient.post('/audit/notifications/templates/seed-defaults'),
    getAlerts: (params?: Record<string, unknown>) => apiClient.get('/audit/notifications/alerts', { params }),
    getUnreadCount: () => apiClient.get('/audit/notifications/alerts/unread-count'),
    markAlertRead: (id: number) => apiClient.post(`/audit/notifications/alerts/${id}/read`),
    markAllAlertsRead: () => apiClient.post('/audit/notifications/alerts/read-all'),
  },
  tools: {
    samplingCalculator: (data: Record<string, unknown>) => apiClient.post('/audit/tools/sampling-calculator', data),
    getRegulatoryChanges: () => apiClient.get('/audit/tools/regulatory-changes'),
  },
  surveys: {
    getAll: (params?: Record<string, unknown>) => apiClient.get('/audit/surveys', { params }),
    getById: (id: number) => apiClient.get(`/audit/surveys/${id}`),
    create: (data: Record<string, unknown>) => apiClient.post('/audit/surveys', data),
    update: (id: number, data: Record<string, unknown>) => apiClient.put(`/audit/surveys/${id}`, data),
    delete: (id: number) => apiClient.delete(`/audit/surveys/${id}`),
    send: (id: number) => apiClient.post(`/audit/surveys/${id}/send`),
    close: (id: number) => apiClient.post(`/audit/surveys/${id}/close`),
    getResponses: (id: number) => apiClient.get(`/audit/surveys/${id}/responses`),
    submitResponse: (surveyId: number, responseId: number, data: Record<string, unknown>) =>
      apiClient.put(`/audit/surveys/${surveyId}/responses/${responseId}`, data),
    aiGenerateQuestions: (data: Record<string, unknown>) => apiClient.post('/audit/surveys/ai/generate-questions', data),
  },
  documents: {
    getAll: (params?: Record<string, unknown>) => apiClient.get('/audit/documents', { params }),
    getById: (id: number) => apiClient.get(`/audit/documents/${id}`),
    create: (data: Record<string, unknown>) => apiClient.post('/audit/documents', data),
    update: (id: number, data: Record<string, unknown>) => apiClient.put(`/audit/documents/${id}`, data),
    delete: (id: number) => apiClient.delete(`/audit/documents/${id}`),
    getStats: () => apiClient.get('/audit/documents/stats'),
    upload: (formData: FormData) => apiClient.post('/audit/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  },
  charter: {
    getAll: () => apiClient.get('/audit/charter'),
    getCurrent: () => apiClient.get('/audit/charter/current'),
    getById: (id: number) => apiClient.get(`/audit/charter/${id}`),
    create: (data: Record<string, unknown>) => apiClient.post('/audit/charter', data),
    update: (id: number, data: Record<string, unknown>) => apiClient.put(`/audit/charter/${id}`, data),
    submit: (id: number, data?: Record<string, unknown>) => apiClient.post(`/audit/charter/${id}/submit-for-approval`, data || {}),
    dueReview: (windowDays = 30) => apiClient.get('/audit/charter/due-review', { params: { window_days: windowDays } }),
    aiGenerate: (data: Record<string, unknown>) => apiClient.post('/audit/charter/ai/generate', data),
    diff: (a: number, b: number) => apiClient.get('/audit/charter/diff', { params: { a, b } }),
    coverage: (id: number) => apiClient.get(`/audit/charter/${id}/coverage`),
    listClauses: (id: number) => apiClient.get(`/audit/charter/${id}/clauses`),
    addClause: (id: number, data: Record<string, unknown>) => apiClient.post(`/audit/charter/${id}/clauses`, data),
    updateClause: (cid: number, data: Record<string, unknown>) => apiClient.put(`/audit/charter/clauses/${cid}`, data),
    deleteClause: (cid: number) => apiClient.delete(`/audit/charter/clauses/${cid}`),
    linkClause: (cid: number, data: Record<string, unknown>) => apiClient.post(`/audit/charter/clauses/${cid}/links`, data),
    unlinkClause: (cid: number, params: Record<string, unknown>) => apiClient.delete(`/audit/charter/clauses/${cid}/links`, { params }),
    listTemplates: (params?: Record<string, unknown>) => apiClient.get('/audit/charter/templates', { params }),
    cloneTemplate: (tid: number, data: Record<string, unknown>) => apiClient.post(`/audit/charter/templates/${tid}/clone`, data),
    listAttestations: () => apiClient.get('/audit/charter/attestations'),
    createAttestation: (data: Record<string, unknown>) => apiClient.post('/audit/charter/attestations', data),
  },
  tlod: {
    getSummary: (params?: Record<string, unknown>) => apiClient.get('/audit/tlod/summary', { params }),
    getEntity: (entityId: number) => apiClient.get(`/audit/tlod/entity/${entityId}`),
    listFirstLine: (params?: Record<string, unknown>) => apiClient.get('/audit/tlod/first-line', { params }),
    createFirstLine: (data: Record<string, unknown>) => apiClient.post('/audit/tlod/first-line', data),
    updateFirstLine: (id: number, data: Record<string, unknown>) => apiClient.put(`/audit/tlod/first-line/${id}`, data),
    deleteFirstLine: (id: number) => apiClient.delete(`/audit/tlod/first-line/${id}`),
    listSecondLine: (params?: Record<string, unknown>) => apiClient.get('/audit/tlod/second-line', { params }),
    createSecondLine: (data: Record<string, unknown>) => apiClient.post('/audit/tlod/second-line', data),
    updateSecondLine: (id: number, data: Record<string, unknown>) => apiClient.put(`/audit/tlod/second-line/${id}`, data),
    deleteSecondLine: (id: number) => apiClient.delete(`/audit/tlod/second-line/${id}`),
    getConfig: () => apiClient.get('/audit/tlod/config'),
    updateConfig: (data: Record<string, unknown>) => apiClient.put('/audit/tlod/config', data),
    listAttestationLinks: (params?: Record<string, unknown>) => apiClient.get('/audit/tlod/attestation-links', { params }),
    createAttestationLink: (data: Record<string, unknown>) => apiClient.post('/audit/tlod/attestation-links', data),
    revokeAttestationLink: (id: number) => apiClient.post(`/audit/tlod/attestation-links/${id}/revoke`),
    deleteAttestationLink: (id: number) => apiClient.delete(`/audit/tlod/attestation-links/${id}`),
    sendStaleReminders: () => apiClient.post('/audit/tlod/attestation-links/send-reminders'),
  },
  externalPortal: {
    getAll: (params?: Record<string, unknown>) => apiClient.get('/audit/external-portal', { params }),
    getById: (id: number) => apiClient.get(`/audit/external-portal/${id}`),
    create: (data: Record<string, unknown>) => apiClient.post('/audit/external-portal', data),
    update: (id: number, data: Record<string, unknown>) => apiClient.put(`/audit/external-portal/${id}`, data),
    delete: (id: number) => apiClient.delete(`/audit/external-portal/${id}`),
    revoke: (id: number) => apiClient.post(`/audit/external-portal/${id}/revoke`),
    shareDocuments: (id: number, data: Record<string, unknown>) => apiClient.post(`/audit/external-portal/${id}/share-documents`, data),
    accessPortal: (token: string) => apiClient.get(`/audit/external-portal/access/${token}`),
    submitPBCItem: (token: string, itemId: string) => apiClient.put(`/audit/external-portal/access/${token}/pbc/${itemId}`, {}),
  },
  analytics: {
    getSummary: () => apiClient.get('/audit/analytics/summary'),
    getFindingsTrend: (params?: Record<string, unknown>) => apiClient.get('/audit/analytics/findings-trend', { params }),
    getSeverityDistribution: () => apiClient.get('/audit/analytics/severity-distribution'),
    getRootCauseAnalysis: () => apiClient.get('/audit/analytics/root-cause-analysis'),
    getRemediationAging: () => apiClient.get('/audit/analytics/remediation-aging'),
    getRepeatFindings: () => apiClient.get('/audit/analytics/repeat-findings'),
    getEngagementPerformance: () => apiClient.get('/audit/analytics/engagement-performance'),
    benfordTest: (data: Record<string, unknown>) => apiClient.post('/audit/analytics/benford-test', data),
    outlierDetection: (data: Record<string, unknown>) => apiClient.post('/audit/analytics/outlier-detection', data),
    getRiskHeatmap: (params?: Record<string, unknown>) => apiClient.get('/audit/analytics/risk-heatmap', { params }),
    getCoverageGap: (params?: Record<string, unknown>) => apiClient.get('/audit/analytics/coverage-gap', { params }),
  },
  issueTracking: {
    getAll: (params?: Record<string, unknown>) => apiClient.get('/audit/issue-tracking', { params }),
    getById: (id: number) => apiClient.get(`/audit/issue-tracking/${id}`),
    create: (data: Record<string, unknown>) => apiClient.post('/audit/issue-tracking', data),
    update: (id: number, data: Record<string, unknown>) => apiClient.put(`/audit/issue-tracking/${id}`, data),
    delete: (id: number) => apiClient.delete(`/audit/issue-tracking/${id}`),
    resolve: (id: number) => apiClient.post(`/audit/issue-tracking/${id}/resolve`),
    getAgingSummary: () => apiClient.get('/audit/issue-tracking/aging-summary'),
    autoEscalate: () => apiClient.post('/audit/issue-tracking/auto-escalate'),
  },
  committee: {
    list: () => apiClient.get('/audit/committee'),
    getPrimary: () => apiClient.get('/audit/committee/primary'),
    create: (data: Record<string, unknown>) => apiClient.post('/audit/committee', data),
    get: (id: number) => apiClient.get(`/audit/committee/${id}`),
    update: (id: number, data: Record<string, unknown>) => apiClient.put(`/audit/committee/${id}`, data),
    delete: (id: number) => apiClient.delete(`/audit/committee/${id}`),
    stats: (id: number) => apiClient.get(`/audit/committee/${id}/stats`),
    listMembers: (id: number) => apiClient.get(`/audit/committee/${id}/members`),
    addMember: (id: number, data: Record<string, unknown>) => apiClient.post(`/audit/committee/${id}/members`, data),
    updateMember: (id: number, mid: number, data: Record<string, unknown>) => apiClient.put(`/audit/committee/${id}/members/${mid}`, data),
    deleteMember: (id: number, mid: number) => apiClient.delete(`/audit/committee/${id}/members/${mid}`),
    listMeetings: (id: number) => apiClient.get(`/audit/committee/${id}/meetings`),
    createMeeting: (id: number, data: Record<string, unknown>) => apiClient.post(`/audit/committee/${id}/meetings`, data),
    getMeeting: (mid: number) => apiClient.get(`/audit/committee/meetings/${mid}`),
    updateMeeting: (mid: number, data: Record<string, unknown>) => apiClient.put(`/audit/committee/meetings/${mid}`, data),
    deleteMeeting: (mid: number) => apiClient.delete(`/audit/committee/meetings/${mid}`),
    approveMinutes: (mid: number) => apiClient.post(`/audit/committee/meetings/${mid}/approve-minutes`),
    addAgenda: (mid: number, data: Record<string, unknown>) => apiClient.post(`/audit/committee/meetings/${mid}/agenda`, data),
    updateAgenda: (aid: number, data: Record<string, unknown>) => apiClient.put(`/audit/committee/agenda/${aid}`, data),
    deleteAgenda: (aid: number) => apiClient.delete(`/audit/committee/agenda/${aid}`),
    addResolution: (mid: number, data: Record<string, unknown>) => apiClient.post(`/audit/committee/meetings/${mid}/resolutions`, data),
    deleteResolution: (rid: number) => apiClient.delete(`/audit/committee/resolutions/${rid}`),
    addAction: (mid: number, data: Record<string, unknown>) => apiClient.post(`/audit/committee/meetings/${mid}/actions`, data),
    updateAction: (aid: number, data: Record<string, unknown>) => apiClient.put(`/audit/committee/actions/${aid}`, data),
    deleteAction: (aid: number) => apiClient.delete(`/audit/committee/actions/${aid}`),
    listOpenActions: () => apiClient.get('/audit/committee/actions/open'),
    addPreRead: (mid: number, data: Record<string, unknown>) => apiClient.post(`/audit/committee/meetings/${mid}/pre-reads`, data),
    uploadPreRead: (mid: number, file: File, meta: { title?: string; description?: string; recipient_member_ids?: number[] }) => {
      const fd = new FormData();
      fd.append('file', file);
      if (meta.title) fd.append('title', meta.title);
      if (meta.description) fd.append('description', meta.description);
      if (meta.recipient_member_ids) fd.append('recipient_member_ids', JSON.stringify(meta.recipient_member_ids));
      return apiClient.post(`/audit/committee/meetings/${mid}/pre-reads/upload`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    deletePreRead: (pid: number) => apiClient.delete(`/audit/committee/pre-reads/${pid}`),
    acknowledge: (mid: number, data: Record<string, unknown>) => apiClient.post(`/audit/committee/meetings/${mid}/acknowledge`, data),
    listApprovals: (params?: Record<string, unknown>) => apiClient.get('/audit/committee/approvals', { params }),
    requestApproval: (id: number, data: Record<string, unknown>) => apiClient.post(`/audit/committee/${id}/approvals`, data),
    decideApproval: (aid: number, data: Record<string, unknown>) => apiClient.post(`/audit/committee/approvals/${aid}/decide`, data),
    approvalReviewContext: (aid: number) => apiClient.get(`/audit/committee/approvals/${aid}/review-context`),
    aiAgenda: (mid: number, data: Record<string, unknown>) => apiClient.post(`/audit/committee/meetings/${mid}/ai/agenda`, data),
    aiMinutes: (mid: number, data: Record<string, unknown>) => apiClient.post(`/audit/committee/meetings/${mid}/ai/minutes`, data),
    reportingPack: (params?: Record<string, unknown>) => apiClient.get('/audit/committee/reporting-pack', { params }),
  },
  ai: {
    generateAuditPlan: (data: Record<string, unknown>) => apiClient.post('/audit/ai/generate-audit-plan', data),
    generateProcedures: (data: Record<string, unknown>) => apiClient.post('/audit/ai/generate-procedures', data),
    draftFinding: (data: Record<string, unknown>) => apiClient.post('/audit/ai/draft-finding', data),
    getCCMInsights: (data: Record<string, unknown>) => apiClient.post('/audit/ai/ccm-insights', data),
    generateBoardPackNarrative: (data: Record<string, unknown>) => apiClient.post('/audit/ai/board-pack-narrative', data),
    getBoardPackNarrative: (data: Record<string, unknown>) => apiClient.post('/audit/ai/board-pack-narrative', data),
    generateEngagementDetails: (data: Record<string, unknown>) => apiClient.post('/audit/ai/generate-engagement-details', data),
    generateScope: (data: Record<string, unknown>) => apiClient.post('/audit/ai/generate-scope', data),
    generateEngagementLetter: (data: Record<string, unknown>) => apiClient.post('/audit/ai/generate-engagement-letter', data),
    getRiskSuggestions: (data: Record<string, unknown>) => apiClient.post('/audit/ai/risk-assessment-suggestions', data),
    findingSimilarity: (data: Record<string, unknown>) => apiClient.post('/audit/ai/finding-similarity', data),
    getFieldworkGuidance: (data: Record<string, unknown>) => apiClient.post('/audit/ai/fieldwork-guidance', data),
    regulatoryImpact: (data: Record<string, unknown>) => apiClient.post('/audit/ai/regulatory-impact-assessment', data),
    generateTestScript: (data: Record<string, unknown>) => apiClient.post('/audit/ai/generate-test-script', data),
    suggestEngagementSkills: (data: Record<string, unknown>) => apiClient.post('/audit/ai/suggest-engagement-skills', data),
    calibrateSeverity: (data: Record<string, unknown>) => apiClient.post('/audit/ai/calibrate-severity', data),
    detectRecurringIssues: (data: Record<string, unknown>) => apiClient.post('/audit/ai/detect-recurring-issues', data),
    evaluateResponse: (data: Record<string, unknown>) => apiClient.post('/audit/ai/evaluate-response', data),
    suggestOpinion: (data: Record<string, unknown>) => apiClient.post('/audit/ai/suggest-opinion', data),
    aggregateThemes: (data: Record<string, unknown>) => apiClient.post('/audit/ai/aggregate-themes', data),
  },
};
