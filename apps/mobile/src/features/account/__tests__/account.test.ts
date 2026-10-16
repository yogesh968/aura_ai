/// <reference types="jest" />
import { defaultPreferences } from '@aura/shared';
import { dateToTime, formatHhmm, mergePreferences, normalizeCurrency, stepValue, timeToDate } from '../prefs';
import { hasErrors, passwordStrength, validateSignIn, validateSignUp } from '../validation';
import { toPermStatus } from '../permissions';

jest.mock('@/lib/api/endpoints', () => ({ endpoints: {} }));
jest.mock('@/lib/settings', () => ({ useSettingsStore: { getState: jest.fn() } }));
jest.mock('expo-location', () => ({}));
jest.mock('expo-notifications', () => ({}));
jest.mock('expo-constants', () => ({ __esModule: true, default: {} }));

describe('time helpers', () => {
  it('round-trips HH:mm through Date', () => {
    const d = timeToDate('07:05');
    expect(d.getHours()).toBe(7);
    expect(d.getMinutes()).toBe(5);
    expect(dateToTime(d)).toBe('07:05');
    expect(dateToTime(timeToDate('23:59'))).toBe('23:59');
  });
  it('formats 12-hour display', () => {
    expect(formatHhmm('00:15')).toBe('12:15 AM');
    expect(formatHhmm('12:00')).toBe('12:00 PM');
    expect(formatHhmm('21:30')).toBe('9:30 PM');
  });
});

describe('preference helpers', () => {
  it('deep-merges nested groups without dropping siblings', () => {
    const merged = mergePreferences(defaultPreferences, { briefings: { ...defaultPreferences.briefings, morningTime: '06:00' }, tone: 'concise' });
    expect(merged.briefings.morningTime).toBe('06:00');
    expect(merged.briefings.eveningTime).toBe(defaultPreferences.briefings.eveningTime);
    expect(merged.voice).toEqual(defaultPreferences.voice);
    expect(merged.tone).toBe('concise');
  });
  it('normalizes currency codes', () => {
    expect(normalizeCurrency(' inr ')).toBe('INR');
    expect(normalizeCurrency('rupees')).toBeNull();
    expect(normalizeCurrency(undefined)).toBeNull();
  });
  it('clamps stepper values and avoids float drift', () => {
    expect(stepValue(1, 0.1, 0.5, 2, 0.1)).toBe(1.1);
    expect(stepValue(2, 0.1, 0.5, 2, 0.1)).toBe(2);
    expect(stepValue(500, -250, 500, 6000, 250)).toBe(500);
  });
});

describe('auth validation', () => {
  it('validates sign in', () => {
    expect(validateSignIn({ email: 'bad', password: '' })).toEqual({ email: 'Enter a valid email address', password: 'Enter your password' });
    expect(hasErrors(validateSignIn({ email: 'a@b.co', password: 'x' }))).toBe(false);
  });
  it('validates sign up', () => {
    const e = validateSignUp({ name: ' ', email: 'a@b.co', password: 'short', confirm: 'other' });
    expect(e.name).toBeDefined();
    expect(e.email).toBeUndefined();
    expect(e.password).toMatch(/8 characters/);
    expect(e.confirm).toBe("Passwords don't match");
    expect(hasErrors(validateSignUp({ name: 'Asha', email: 'asha@example.com', password: 'long-enough-1', confirm: 'long-enough-1' }))).toBe(false);
  });
  it('scores password strength', () => {
    expect(passwordStrength('abc')).toBe(0);
    expect(passwordStrength('abcdefgh')).toBe(1);
    expect(passwordStrength('Abcdefg1!')).toBe(3);
  });
});

describe('permission mapping', () => {
  it('maps permission responses', () => {
    expect(toPermStatus({ status: 'granted', granted: true })).toBe('granted');
    expect(toPermStatus({ status: 'denied' })).toBe('denied');
    expect(toPermStatus({ status: 'undetermined' })).toBe('undetermined');
    expect(toPermStatus(null)).toBe('unavailable');
  });
});
