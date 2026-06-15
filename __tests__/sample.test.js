/**
 * Example test file for CareConnect
 * 
 * To run tests:
 * npm test
 * 
 * To run tests with coverage:
 * npm test -- --coverage
 */

describe('Sample Test Suite', () => {
  test('should pass a basic assertion', () => {
    expect(1 + 1).toBe(2);
  });

  test('should verify strings', () => {
    expect('CareConnect').toContain('Care');
  });

  test('should verify arrays', () => {
    const services = ['GP consultations', 'Prescriptions', 'Appointments'];
    expect(services).toHaveLength(3);
    expect(services).toContain('GP consultations');
  });

  test('should verify objects', () => {
    const practice = {
      name: 'CareConnect GP Practice',
      opens: '8:00 AM',
      closes: '6:30 PM'
    };
    expect(practice).toHaveProperty('name');
    expect(practice.name).toBe('CareConnect GP Practice');
  });
});
