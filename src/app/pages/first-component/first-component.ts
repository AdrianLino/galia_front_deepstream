import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-first-component',
  imports: [],
  templateUrl: './first-component.html',
  styleUrl: './first-component.css',
})
export class FirstComponent {

  router = inject(Router);

  goToSecondComponent() {
    this.router.navigate(['hola']);
  }
}
