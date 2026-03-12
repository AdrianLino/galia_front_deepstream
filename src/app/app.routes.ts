import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'dashboard',
    loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.DashboardComponent),
  },
  {
    path: 'stream',
    loadComponent: () => import('./pages/stream/stream').then((m) => m.StreamComponent),
  },
  {
    path: 'faces',
    loadComponent: () => import('./pages/faces/faces').then((m) => m.FacesComponent),
  },
  {
    path: 'nvr',
    loadComponent: () => import('./pages/nvr/nvr').then((m) => m.NvrComponent),
  },
  {
    path: 'video',
    loadComponent: () => import('./pages/video/video').then((m) => m.VideoComponent),
  },
  {
    path: 'map',
    loadComponent: () => import('./pages/map/map').then((m) => m.MapComponent),
  },
  {
    path: 'geocercas',
    loadComponent: () => import('./pages/geocercas/geocercas').then((m) => m.GeocercasComponent),
  },
  { path: '**', redirectTo: 'dashboard' },
];
