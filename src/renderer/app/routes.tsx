import type { ReactElement } from 'react';
import type { IconName } from '../components/Icon';
import { AreaFormPage } from '../pages/areas/AreaFormPage';
import { AreaPage } from '../pages/areas/AreaPage';
import { AreasPage } from '../pages/areas/AreasPage';
import { CategoriesPage } from '../pages/areas/CategoriesPage';
import { DeletedItemsPage } from '../pages/DeletedItemsPage';
import { PlaceholderPage } from '../pages/PlaceholderPage';
import { SettingsPage } from '../pages/SettingsPage';

interface NavItem {
  path: string;
  key: 'home' | 'areas' | 'reports' | 'notifications' | 'settings';
  icon: IconName;
  element: ReactElement;
}

/** The sidebar items and their screens, in menu order. One list drives both. */
export const NAV_ITEMS: readonly NavItem[] = [
  { path: '/', key: 'home', icon: 'home', element: <PlaceholderPage page="home" /> },
  { path: '/areas', key: 'areas', icon: 'areas', element: <AreasPage /> },
  {
    path: '/reports',
    key: 'reports',
    icon: 'reports',
    element: <PlaceholderPage page="reports" />,
  },
  {
    path: '/notifications',
    key: 'notifications',
    icon: 'notifications',
    element: <PlaceholderPage page="notifications" />,
  },
  { path: '/settings', key: 'settings', icon: 'settings', element: <SettingsPage /> },
];

/** Screens reached from inside other screens rather than from the sidebar. */
export const INNER_ROUTES: readonly { path: string; element: ReactElement }[] = [
  { path: '/areas/new', element: <AreaFormPage /> },
  { path: '/areas/categories', element: <CategoriesPage /> },
  { path: '/areas/:id', element: <AreaPage /> },
  { path: '/areas/:id/edit', element: <AreaFormPage /> },
  { path: '/settings/deleted', element: <DeletedItemsPage /> },
];
