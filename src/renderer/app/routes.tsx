import type { ReactElement } from 'react';
import type { IconName } from '../components/Icon';
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
  { path: '/areas', key: 'areas', icon: 'areas', element: <PlaceholderPage page="areas" /> },
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
