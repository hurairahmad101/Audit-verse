"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useCallback } from "react";
import {
  LayoutDashboard,
  FileText,
  ClipboardCheck,
  AlertTriangle,
  Users,
  ClipboardList,
  Server,
  Settings,
  ChevronDown,
  ChevronRight,
  Activity,
  Clock,
  Globe,
  Calendar,
  CheckCircle,
  Bot,
  Bell,
  Shield,
  ShieldCheck,
  FolderOpen,
  BarChart3,
  BookOpen,
  ExternalLink,
  AlertCircle,
  MessageSquare,
  PlayCircle,
  Monitor,
  Gavel,
  Calculator,
  Map as MapIcon,
  Repeat,
  type LucideIcon,
} from "lucide-react";
import { useState, useEffect } from "react";
import { clsx } from "clsx";
import { apiClient } from "@/lib/api";

const navIconProps = {
  size: 18,
  strokeWidth: 1.5,
};

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  requiredPermissions?: string[];
}

interface NavGroup {
  name: string;
  icon: LucideIcon;
  items: NavItem[];
  defaultOpen?: boolean;
  requiredModules?: string[];
  adminOnly?: boolean;
}

type NavEntry = (NavItem & { requiredModules?: string[]; adminOnly?: boolean }) | NavGroup;

const auditLifecycleLink: NavItem & { requiredModules?: string[] } = {
  name: 'Audit Lifecycle',
  href: '/audit',
  icon: LayoutDashboard,
  requiredModules: ['audit'],
};

const navigation: NavEntry[] = [
  auditLifecycleLink,
  {
    name: 'Governance',
    icon: ShieldCheck,
    requiredModules: ['audit'],
    defaultOpen: true,
    items: [
      { name: 'Charter', href: '/audit/charter', icon: BookOpen },
      { name: 'Audit Committee', href: '/audit/committee', icon: Gavel },
      { name: 'Reporting Pack', href: '/audit/committee/reporting-pack', icon: FileText },
      { name: '3LoD Inputs', href: '/audit/tlod', icon: Shield },
      { name: 'Skill Matrix', href: '/audit/skill-matrix', icon: Users },
      { name: 'Capacity Planning', href: '/audit/capacity', icon: Clock },
    ],
  },
  {
    name: 'Planning',
    icon: MapIcon,
    requiredModules: ['audit'],
    items: [
      { name: 'Audit Universe', href: '/audit/universe', icon: Globe },
      { name: 'Risk Register', href: '/audit/risk-register', icon: AlertTriangle },
      { name: 'Risk Scoring', href: '/audit/scoring', icon: Calculator },
      { name: 'Annual Audit Plans', href: '/audit/plans', icon: Calendar },
    ],
  },
  {
    name: 'Execution',
    icon: ClipboardList,
    requiredModules: ['audit'],
    items: [
      { name: 'Engagements', href: '/audit/engagements', icon: ClipboardCheck },
      { name: 'Workpapers', href: '/audit/workpapers', icon: FileText },
      { name: 'Test Scripts', href: '/audit/test-scripts', icon: ClipboardList },
      { name: 'Findings', href: '/audit/findings', icon: AlertTriangle },
      { name: 'Issue Tracking', href: '/audit/issues', icon: AlertCircle },
    ],
  },
  {
    name: 'Continuous Activities',
    icon: Repeat,
    requiredModules: ['audit'],
    items: [
      { name: 'CCM', href: '/audit/ccm', icon: Activity },
      { name: 'Surveys', href: '/audit/surveys', icon: MessageSquare },
      { name: 'Document Repository', href: '/audit/documents', icon: FolderOpen },
      { name: 'External Auditor Portal', href: '/audit/portal', icon: ExternalLink },
    ],
  },
  {
    name: 'Reporting & Quality',
    icon: BarChart3,
    requiredModules: ['audit'],
    items: [
      { name: 'Analytics', href: '/audit/analytics', icon: BarChart3 },
      { name: 'Reporting', href: '/audit/reporting', icon: FileText },
      { name: 'QAIP', href: '/audit/qaip', icon: CheckCircle },
      { name: 'Notifications', href: '/audit/notifications', icon: Bell },
    ],
  },
  {
    name: 'Administration',
    icon: Settings,
    adminOnly: true,
    requiredModules: ['admin'],
    items: [
      { name: 'Overview', href: '/admin', icon: Settings, requiredPermissions: ['admin:organization:*'] },
      { name: 'Company', href: '/admin/organization', icon: Server, requiredPermissions: ['admin:organization:*'] },
      { name: 'User Management', href: '/admin/users', icon: Users, requiredPermissions: ['admin:users:*'] },
      { name: 'Role Management', href: '/admin/roles', icon: Shield, requiredPermissions: ['admin:roles:*'] },
      { name: 'Audit Logs', href: '/admin/audit-logs', icon: FileText, requiredPermissions: ['admin:audit_logs:*'] },
    ],
  },
  { name: 'Demo Tour', href: '/demo', icon: PlayCircle },
  { name: 'Pitch Deck', href: '/pitch', icon: Monitor },
];

function isGroup(item: NavEntry): item is NavGroup {
  return 'items' in item;
}

function NavItemLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const pathname = usePathname();
  const isActive = pathname === item.href || 
    (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'));

  return (
    <Link
      href={item.href}
      className={clsx(
        'group flex items-center gap-3 rounded-[var(--radius-md)] border-l-[3px] px-3 py-2 text-[13px] font-normal transition-all duration-150',
        isActive 
          ? 'border-[var(--sidebar-active-border)] bg-[var(--sidebar-active-bg)] text-[var(--color-text-inverse)] font-medium' 
          : 'border-transparent text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover-bg)] hover:text-[var(--color-text-inverse)]',
        collapsed && 'justify-center px-2'
      )}
      title={collapsed ? item.name : undefined}
    >
      <item.icon
        {...navIconProps}
        className={clsx(
          'flex-shrink-0 transition-colors duration-150',
          isActive ? 'text-[var(--color-text-inverse)]' : 'text-[var(--sidebar-icon)] group-hover:text-[var(--color-text-inverse)]'
        )} 
      />
      {!collapsed && <span className="truncate">{item.name}</span>}
    </Link>
  );
}

function NavGroupSection({ group, collapsed }: { group: NavGroup; collapsed: boolean }) {
  const pathname = usePathname();
  const isAnyChildActive = group.items.some(
    item => pathname === item.href || 
    (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'))
  );
  const storageKey = `sidebar:group:${group.name}`;
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return group.defaultOpen || false;
    const saved = window.localStorage.getItem(storageKey);
    if (saved === 'open') return true;
    if (saved === 'closed') return false;
    return group.defaultOpen || false;
  });

  useEffect(() => {
    if (isAnyChildActive && !isOpen) {
      setIsOpen(true);
    }
  }, [isAnyChildActive, isOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(storageKey, isOpen ? 'open' : 'closed');
  }, [isOpen, storageKey]);

  const [flyoutOpen, setFlyoutOpen] = useState(false);

  if (collapsed) {
    return (
      <div
        className="relative group/nav"
        onKeyDown={(e) => {
          if (e.key === 'Escape') setFlyoutOpen(false);
        }}
      >
        <button
          aria-haspopup="menu"
          aria-expanded={flyoutOpen}
          aria-label={group.name}
          onClick={() => setFlyoutOpen(v => !v)}
          onFocus={() => setFlyoutOpen(true)}
          onMouseEnter={() => setFlyoutOpen(true)}
          onMouseLeave={() => setFlyoutOpen(false)}
          onBlur={(e) => {
            if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) {
              setFlyoutOpen(false);
            }
          }}
          className={clsx(
            'flex items-center justify-center w-full rounded-[var(--radius-md)] border-l-[3px] p-2.5 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[var(--sidebar-active-border)]',
            isAnyChildActive
              ? 'border-[var(--sidebar-active-border)] bg-[var(--sidebar-active-bg)] text-[var(--color-text-inverse)]'
              : 'border-transparent text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover-bg)] hover:text-[var(--color-text-inverse)]'
          )}
        >
          <group.icon {...navIconProps} className="text-[var(--sidebar-icon)] group-hover:text-[var(--color-text-inverse)]" />
        </button>
        <div
          role="menu"
          aria-label={group.name}
          onMouseEnter={() => setFlyoutOpen(true)}
          onMouseLeave={() => setFlyoutOpen(false)}
          onFocus={() => setFlyoutOpen(true)}
          onBlur={(e) => {
            if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) {
              setFlyoutOpen(false);
            }
          }}
          className={clsx(
            'absolute left-full top-0 ml-2 z-50 group-hover/nav:block group-focus-within/nav:block',
            flyoutOpen ? 'block' : 'hidden'
          )}
        >
          <div className="min-w-[200px] rounded-[var(--radius-lg)] border border-[var(--sidebar-hover-bg)] bg-[var(--color-base)] py-2">
            <div className="px-3 py-1.5 text-[10px] font-normal uppercase tracking-[0.12em] text-[var(--sidebar-text-section)]">
              {group.name}
            </div>
            {group.items.map(item => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={() => setFlyoutOpen(false)}
                className={clsx(
                  'flex items-center gap-2 border-l-[3px] px-3 py-2 text-[13px] transition-colors focus:outline-none focus:bg-[var(--sidebar-hover-bg)] focus:text-[var(--color-text-inverse)]',
                  pathname === item.href || pathname.startsWith(item.href + '/')
                    ? 'border-[var(--sidebar-active-border)] bg-[var(--sidebar-active-bg)] text-[var(--color-text-inverse)]'
                    : 'border-transparent text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover-bg)] hover:text-[var(--color-text-inverse)]'
                )}
              >
                <item.icon {...navIconProps} className="text-[var(--sidebar-icon)]" />
                {item.name}
              </Link>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-0.5 pt-2 mt-1 border-t border-[var(--sidebar-hover-bg)]/50 first:border-t-0 first:pt-0 first:mt-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls={`navgroup-${group.name}`}
        className={clsx(
          'group flex w-full items-center gap-3 rounded-[var(--radius-md)] border-l-[3px] px-3 py-2 text-[10px] font-normal uppercase tracking-[0.12em] transition-all duration-150',
          isAnyChildActive
            ? 'border-[var(--sidebar-active-border)] bg-[var(--sidebar-active-bg)] text-[var(--color-text-inverse)]'
            : 'border-transparent text-[var(--sidebar-text-section)] hover:bg-[var(--sidebar-hover-bg)] hover:text-[var(--color-text-inverse)]'
        )}
      >
        <group.icon
          {...navIconProps}
          className={clsx(
            'flex-shrink-0 transition-colors duration-150',
            isAnyChildActive ? 'text-[var(--color-text-inverse)]' : 'text-[var(--sidebar-icon)] group-hover:text-[var(--color-text-inverse)]'
          )} 
        />
        <span className="flex-1 text-left truncate">{group.name}</span>
        <ChevronDown
          {...navIconProps}
          className={clsx(
            'text-[var(--sidebar-icon)] transition-transform duration-200',
            isOpen ? '' : '-rotate-90'
          )}
        />
      </button>
      {isOpen && (
        <div id={`navgroup-${group.name}`} className="ml-4 space-y-0.5 border-l border-[var(--sidebar-hover-bg)] pl-4">
          {group.items.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'group flex items-center gap-3 rounded-[var(--radius-md)] border-l-[3px] px-3 py-1.5 text-[12px] transition-all duration-150',
                (pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href + '/')))
                  ? 'border-[var(--sidebar-active-border)] bg-[var(--sidebar-active-bg)] text-[var(--color-text-inverse)] font-medium'
                  : 'border-transparent text-[var(--sidebar-text-subitem)] hover:bg-[var(--sidebar-hover-bg)] hover:text-[var(--color-text-inverse)]'
              )}
            >
              <item.icon
                {...navIconProps}
                className={clsx(
                  'flex-shrink-0',
                  (pathname === item.href || pathname.startsWith(item.href + '/'))
                    ? 'text-[var(--color-text-inverse)]' 
                    : 'text-[var(--sidebar-icon)] group-hover:text-[var(--color-text-inverse)]'
                )} 
              />
              <span className="truncate">{item.name}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [allowedModules, setAllowedModules] = useState<string[]>([]);
  const [allowedPermissions, setAllowedPermissions] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const adminDefaultModules = useMemo(() => [
    'audit', 'admin', 'complychat'
  ], []);

  const authenticatedDefaultModules = useMemo(() => [
    'audit', 'complychat'
  ], []);

  const normalizePerm = (perm: string): string => {
    const cleaned = perm.trim();
    if (!cleaned) return '';
    return cleaned.includes('.') ? cleaned.replace(/\./g, ':') : cleaned;
  };

  const extractModuleFromPerm = useCallback((perm: string): string => {
    const normalized = normalizePerm(perm);
    return normalized.split(':')[0] || '';
  }, []);

  useEffect(() => {
    const loadMe = async () => {
      let data: any = null;
      try {
        const res = await apiClient.get('/auth/me');
        data = res.data;
      } catch {
        // Fallback to raw fetch in case axios interceptors/session state cause an edge-case redirect
        try {
          const res = await fetch('/api/auth/me', { credentials: 'include' });
          data = await res.json();
        } catch {
          data = null;
        }
      }

      if (data?.authenticated && data.user) {
        const rawPermissions: string[] = data.user.permissions || [];
        const permissions: string[] = rawPermissions
          .filter((perm) => typeof perm === 'string')
          .map((perm) => normalizePerm(perm));
        const explicitModules: string[] = data.user.allowed_modules || [];
        const modulesFromPermissions = permissions
          .map((perm) => extractModuleFromPerm(perm))
          .filter((m) => !!m);
        const resolvedModules = Array.from(new Set([
          ...explicitModules,
          ...modulesFromPermissions,
        ]));

        // Defensive fallback: some tenants can return authenticated user with empty role payload.
        // In that case, avoid collapsing sidebar to a near-empty state.
        const hasNoAccessPayload = resolvedModules.length === 0 && permissions.length === 0;

        setAllowedModules(hasNoAccessPayload ? authenticatedDefaultModules : resolvedModules);
        setAllowedPermissions(permissions);
        const adminStatus = data.user.is_admin || false;
        setIsAdmin(adminStatus);
        
        // If admin but no modules/permissions set, initialize with all modules
        if (adminStatus && resolvedModules.length === 0) {
          setAllowedModules(adminDefaultModules);
          setAllowedPermissions(['*:*:*']);
        }
      }
      setLoaded(true);
    };

    loadMe()
      .catch((error) => {
        console.error('Failed to fetch user data:', error);
        setLoaded(true);
      });
  }, [adminDefaultModules, authenticatedDefaultModules, extractModuleFromPerm]);

  const matchesPermission = (requiredPerm: string) => {
    const required = normalizePerm(requiredPerm);

    // Admin bypass
    if (allowedPermissions.includes('*:*:*')) return true;
    
    // Exact match
    if (allowedPermissions.includes(required)) return true;
    
    // If required permission is a wildcard like "risks:risk_register:*"
    if (required.endsWith(':*')) {
      const prefix = required.slice(0, -2); // "risks:risk_register"
      // Check if user has ANY permission starting with this prefix
      return allowedPermissions.some((perm) => perm.startsWith(prefix + ':'));
    }
    
    // If required permission is specific like "risks:risk_register:view"
    // Check if user has a wildcard that covers it
    const parts = required.split(':');
    if (parts.length === 3) {
      const wildcardPerm = `${parts[0]}:${parts[1]}:*`;
      if (allowedPermissions.includes(wildcardPerm)) return true;
      
      // Also check module-level wildcard
      const moduleWildcard = `${parts[0]}:*:*`;
      if (allowedPermissions.includes(moduleWildcard)) return true;
    }
    
    return false;
  };

  const hasPermission = (required?: string[]) => {
    if (!required || required.length === 0) return true;
    if (isAdmin) return true;
    return required.some((perm) => matchesPermission(perm));
  };

  const hasModuleAccess = (required?: string[]) => {
    if (!required || required.length === 0) return true;
    if (isAdmin) return true;
    return required.some((mod) => allowedModules.includes(mod));
  };

  const canAccessItem = (item: NavItem & { requiredModules?: string[]; adminOnly?: boolean }) => {
    if (item.adminOnly && !isAdmin) return false;
    if (!hasModuleAccess(item.requiredModules)) return false;

    // Fallback for tenants where module access is populated but fine-grained permissions are empty/migrating
    if (!isAdmin && allowedModules.length > 0 && allowedPermissions.length === 0) {
      return true;
    }

    return hasPermission(item.requiredPermissions);
  };

  const filteredNavigation: NavEntry[] = loaded
    ? navigation.reduce<NavEntry[]>((acc, item) => {
        if (isGroup(item)) {
          if (item.adminOnly && !isAdmin) return acc;
          if (!hasModuleAccess(item.requiredModules)) return acc;

          const filteredItems = item.items.filter((child) => canAccessItem(child));
          if (filteredItems.length === 0) return acc;

          acc.push({ ...item, items: filteredItems });
          return acc;
        }

        if (canAccessItem(item)) {
          acc.push(item);
        }
        return acc;
      }, [])
    : [];

  return (
    <aside
      className={clsx(
        'flex flex-col bg-[var(--color-base)] transition-all duration-300 ease-out',
        collapsed ? 'w-[68px]' : 'w-60'
      )}
    >
      <div className={clsx(
        'h-14 flex items-center border-b border-[var(--sidebar-hover-bg)] transition-all duration-300',
        collapsed ? 'px-3 justify-center' : 'px-4'
      )}>
        <div className="flex items-center gap-2.5">
          <Shield {...navIconProps} className="text-[var(--color-text-inverse)] flex-shrink-0" />
          {!collapsed && (
            <span className="whitespace-nowrap text-lg font-semibold text-[var(--color-text-inverse)]">AuditVerse.AI</span>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-0.5">
        {filteredNavigation.map((item) => {
          if (isGroup(item)) {
            return (
              <NavGroupSection
                key={item.name}
                group={item}
                collapsed={collapsed}
              />
            );
          }
          return (
            <NavItemLink
              key={item.name}
              item={item}
              collapsed={collapsed}
            />
          );
        })}
      </nav>

      <div className="border-t border-[var(--sidebar-hover-bg)] p-3">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={clsx(
            'flex w-full items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-[12px] transition-all duration-150',
            'text-[var(--sidebar-text-collapse)] hover:bg-[var(--sidebar-hover-bg)] hover:text-[var(--color-text-inverse)]',
            collapsed && 'justify-center px-2'
          )}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ChevronRight
            {...navIconProps}
            className={clsx(
              'transition-transform duration-300',
              !collapsed && 'rotate-180'
            )}
          />
          {!collapsed && <span className="text-sm">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
