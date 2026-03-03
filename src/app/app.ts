import { Component, inject, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { FirstComponent } from './pages/first-component/first-component';
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, FirstComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('galia_front');

  router = inject(Router);


  goToFirstComponent() {
    this.router.navigate(['first']);
  }
  
}
