import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-nav',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="bg-gray-900 text-white px-6 py-3 flex items-center gap-6">
      <span class="font-bold text-lg tracking-wide">GALIA</span>
      <a routerLink="/dashboard" routerLinkActive="text-blue-400 font-semibold"
         class="text-gray-300 hover:text-white transition-colors">Dashboard</a>
      <a routerLink="/stream" routerLinkActive="text-blue-400 font-semibold"
         class="text-gray-300 hover:text-white transition-colors">Stream</a>
      <a routerLink="/faces" routerLinkActive="text-blue-400 font-semibold"
         class="text-gray-300 hover:text-white transition-colors">Faces</a>
      <a routerLink="/nvr" routerLinkActive="text-blue-400 font-semibold"
         class="text-gray-300 hover:text-white transition-colors">NVR</a>
    </nav>
  `,
})
export class NavComponent {}
