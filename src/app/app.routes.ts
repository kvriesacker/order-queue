import { Routes } from '@angular/router';
import { Home } from './pages/home';
import { Shell } from './pages/shell';
import { RolePicker } from './pages/role-picker';
import { Take } from './pages/take';
import { Station } from './pages/station';
import { Counter } from './pages/counter';
import { Display } from './pages/display';
import { MenuPage } from './pages/menu-page';

export const routes: Routes = [
  { path: '', component: Home, title: 'Pizza queue' },
  { path: 'q/:id/display', component: Display, title: 'Orders ready' },
  {
    path: 'q/:id',
    component: Shell,
    children: [
      { path: '', component: RolePicker, title: 'Pizza queue' },
      { path: 'take', component: Take, title: 'Take orders' },
      { path: 'kitchen', component: Station, title: 'Kitchen', data: { station: 'kitchen' } },
      { path: 'oven', component: Station, title: 'Oven', data: { station: 'oven' } },
      { path: 'counter', component: Counter, title: 'Counter' },
      { path: 'menu', component: MenuPage, title: 'Settings' },
    ],
  },
  { path: '**', redirectTo: '' },
];
