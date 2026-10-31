// AUTO-GENERATED AT BUILD TIME BY scripts/generate-build-info.js
// DO NOT EDIT DIRECTLY. This file is regenerated on every build.

export interface BuildMetadata {
  appName: string;
  version: string;
  buildNumber: number;
  channel: 'staging' | 'production';
  buildTimestamp: string;
  buildDate: string;
  buildTime: string;
}

export const BUILD_INFO: BuildMetadata = {
  appName: 'RoomMate',
  version: '1.0.4',
  buildNumber: 10,
  channel: 'production' as 'staging' | 'production',
  buildTimestamp: '2026-10-31T15:04:32.805Z',
  buildDate: '31 Oct 2026',
  buildTime: '20:34:32 IST',
};

export default BUILD_INFO;
