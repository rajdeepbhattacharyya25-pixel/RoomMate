import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { UserAvatar, InstagramAvatarFallback } from './UserAvatar';

describe('UserAvatar & Instagram Fallback Test Suite', () => {
  it('renders InstagramAvatarFallback SVG with authentic grey background and white silhouette geometry', () => {
    const html = renderToString(<InstagramAvatarFallback altText="Default Avatar" />);

    // Must have SVG element
    expect(html).toContain('<svg');
    // Must feature Instagram signature medium-grey background #797E87
    expect(html).toContain('fill="#797E87"');
    // Must feature circular head at cx=50, cy=37.5, r=14.5 in white #FFFFFF
    expect(html).toContain('cx="50"');
    expect(html).toContain('cy="37.5"');
    expect(html).toContain('r="14.5"');
    expect(html).toContain('fill="#FFFFFF"');
    // Must feature torso pill/capsule rx=9.5 in white
    expect(html).toContain('rx="9.5"');
  });

  it('renders user image when valid src string is provided', () => {
    const photoUrl = 'https://lh3.googleusercontent.com/a/google-user-photo-123';
    const html = renderToString(
      <UserAvatar src={photoUrl} name="Raju Sharma" size="xl" />
    );

    expect(html).toContain('<img');
    expect(html).toContain(photoUrl);
    expect(html).toContain('alt="Raju Sharma"');
    expect(html).not.toContain('fill="#797E87"');
  });

  it('renders Instagram fallback when src is null or undefined', () => {
    const htmlNull = renderToString(<UserAvatar src={null} name="No Photo" />);
    expect(htmlNull).toContain('fill="#797E87"');
    expect(htmlNull).not.toContain('<img');

    const htmlUndefined = renderToString(<UserAvatar src={undefined} name="No Photo" />);
    expect(htmlUndefined).toContain('fill="#797E87"');
    expect(htmlUndefined).not.toContain('<img');
  });

  it('renders avatar from user object prop when present', () => {
    const userWithPhoto = {
      name: 'Raju',
      avatarUrl: 'https://lh3.googleusercontent.com/a/google-dp-raju',
      email: 'raju@gmail.com',
    };

    const html = renderToString(<UserAvatar user={userWithPhoto} size="md" />);
    expect(html).toContain('<img');
    expect(html).toContain('https://lh3.googleusercontent.com/a/google-dp-raju');
  });

  it('falls back to Instagram silhouette when user object has no avatarUrl', () => {
    const userWithoutPhoto = {
      name: 'Raju',
      email: 'raju@gmail.com',
    };

    const html = renderToString(<UserAvatar user={userWithoutPhoto} size="md" />);
    expect(html).toContain('fill="#797E87"');
    expect(html).toContain('fill="#FFFFFF"');
    expect(html).not.toContain('<img');
  });

  it('applies squircle rounded-2xl class and custom border classes', () => {
    const html = renderToString(
      <UserAvatar
        src={null}
        size="xl"
        roundedClassName="rounded-2xl"
        showBorder={true}
        borderColorClassName="border-indigo-500"
      />
    );

    expect(html).toContain('w-16 h-16');
    expect(html).toContain('rounded-2xl');
    expect(html).toContain('border-indigo-500');
  });

  it('supports initials fallback when explicitly requested via fallbackType="initials"', () => {
    const html = renderToString(
      <UserAvatar src={null} name="Priya" fallbackType="initials" />
    );

    expect(html).toContain('P');
    expect(html).toContain('bg-indigo-600');
  });

  it('renders Instagram fallback when src is a known Google default avatar', () => {
    const defaultGoogleAvatar = 'https://lh3.googleusercontent.com/a/default-user=s96-c';
    const html = renderToString(
      <UserAvatar src={defaultGoogleAvatar} name="Raju" />
    );

    expect(html).toContain('fill="#797E87"');
    expect(html).toContain('fill="#FFFFFF"');
    expect(html).not.toContain('<img');
  });
});

