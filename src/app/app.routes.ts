import { Routes } from '@angular/router';
import { Home } from './pages/home';
import { Shell } from './pages/shell';
import { RolePicker } from './pages/role-picker';
import { Take } from './pages/take';
import { Kitchen } from './pages/kitchen';
import { Counter } from './pages/counter';
import { Display } from './pages/display';

export const routes: Routes = [
  { path: '', component: Home, title: 'Pizza queue' },
  { path: 'q/:id/display', component: Display, title: 'Orders ready' },
  {
    path: 'q/:id',
    component: Shell,
    children: [
      { path: '', component: RolePicker, title: 'Pizza queue' },
      { path: 'take', component: Take, title: 'Take orders' },
      { path: 'kitchen', component: Kitchen, title: 'Kitchen' },
      { path: 'counter', component: Counter, title: 'Counter' },
    ],
  },
  { path: '**', redirectTo: '' },
];
