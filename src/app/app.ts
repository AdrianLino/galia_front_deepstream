import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavComponent } from './shared/nav/nav.component';
import { AlertToastsComponent } from './shared/alert-toasts/alert-toasts.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NavComponent, AlertToastsComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {}
