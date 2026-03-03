import { Routes } from '@angular/router';
import { FirstComponent } from './pages/first-component/first-component';
export const routes: Routes = [


    {
        path: 'first',
        component: FirstComponent,
    },
    {
        path: 'hola',
        loadComponent: () => import('./pages/hola/hola').then((m) => m.Hola),
        
    },
];
