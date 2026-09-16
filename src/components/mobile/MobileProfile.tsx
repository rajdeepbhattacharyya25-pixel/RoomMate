/**
 * MobileProfile — Rollback-Safe Facade
 *
 * Re-exports the modern 9-category MobileSettings component while maintaining
 * complete prop signature compatibility for existing consumers across the application.
 */
import React from 'react';
import { MobileSettings, MobileSettingsProps } from './settings/MobileSettings';

export type MobileProfileProps = MobileSettingsProps;

export const MobileProfile: React.FC<MobileProfileProps> = (props) => {
  return <MobileSettings {...props} />;
};

export default MobileProfile;
