import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Hola } from './hola';

describe('Hola', () => {
  let component: Hola;
  let fixture: ComponentFixture<Hola>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Hola],
    }).compileComponents();

    fixture = TestBed.createComponent(Hola);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
