import { TestBed } from '@angular/core/testing';

import { Prueba } from './prueba';

describe('Prueba', () => {
  let service: Prueba;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Prueba);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
