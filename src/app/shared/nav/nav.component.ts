import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-nav',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="sticky top-0 z-50 bg-gray-900/80 backdrop-blur-md border-b border-gray-700/50 shadow-lg px-6 py-3 flex items-center justify-between transition-all w-full h-16">
      
      <!-- Logo Section -->
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-900/40">
          <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
        </div>
        <span class="font-black text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">GALIA</span>
      </div>

      <!-- Navigation Links -->
      <div class="flex items-center gap-1.5 p-1 bg-gray-800/50 rounded-xl border border-gray-700/30">
        <a routerLink="/dashboard" routerLinkActive="bg-gray-700 text-white shadow-sm" [routerLinkActiveOptions]="{exact: true}"
           class="px-4 py-1.5 rounded-lg text-sm font-semibold text-gray-400 hover:text-white hover:bg-gray-700/50 transition-all flex items-center gap-2">
           <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
           Dashboard
        </a>
        <a routerLink="/stream" routerLinkActive="bg-blue-600 text-white shadow-md shadow-blue-900/20"
           class="px-4 py-1.5 rounded-lg text-sm font-semibold text-gray-400 hover:text-white hover:bg-gray-700/50 transition-all flex items-center gap-2">
           <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
           Stream
        </a>
        <a routerLink="/video" routerLinkActive="bg-pink-600 text-white shadow-md shadow-pink-900/20"
           class="px-4 py-1.5 rounded-lg text-sm font-semibold text-gray-400 hover:text-white hover:bg-gray-700/50 transition-all flex items-center gap-2">
           <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M7 4v16l13-8z" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>
           Video
        </a>
        <a routerLink="/faces" routerLinkActive="bg-purple-600 text-white shadow-md shadow-purple-900/20"
           class="px-4 py-1.5 rounded-lg text-sm font-semibold text-gray-400 hover:text-white hover:bg-gray-700/50 transition-all flex items-center gap-2">
           <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
           Faces
        </a>
        <a routerLink="/nvr" routerLinkActive="bg-emerald-600 text-white shadow-md shadow-emerald-900/20"
           class="px-4 py-1.5 rounded-lg text-sm font-semibold text-gray-400 hover:text-white hover:bg-gray-700/50 transition-all flex items-center gap-2">
           <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"/></svg>
           NVR
        </a>
        <a routerLink="/map" routerLinkActive="bg-cyan-600 text-white shadow-md shadow-cyan-900/20"
           class="px-4 py-1.5 rounded-lg text-sm font-semibold text-gray-400 hover:text-white hover:bg-gray-700/50 transition-all flex items-center gap-2">
           <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-1.447-.894L15 9m0 8V9m0 0L9 7"/></svg>
           Mapa
        </a>
        <a routerLink="/geocercas" routerLinkActive="bg-orange-600 text-white shadow-md shadow-orange-900/20"
           class="px-4 py-1.5 rounded-lg text-sm font-semibold text-gray-400 hover:text-white hover:bg-gray-700/50 transition-all flex items-center gap-2">
           <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
           Geocercas
        </a>
      </div>

      <!-- Right Side (User Profile / Actions) -->
      <div class="flex items-center gap-3">
        <button class="w-8 h-8 flex items-center justify-center rounded-full bg-gray-800 text-gray-400 hover:text-white border border-gray-700 transition-colors">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
        </button>
        <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-gray-700 to-gray-500 border border-gray-600 flex items-center justify-center cursor-pointer shadow-sm">
          <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
        </div>
      </div>
    </nav>
  `,
})
export class NavComponent {}
