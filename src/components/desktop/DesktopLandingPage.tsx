import React, { useState } from 'react';
import { User } from '../../types';
import { SuperAdminLoginModal } from './SuperAdminLoginModal';
import { LandingNavbar } from '../landing/LandingNavbar';
import { HeroSection } from '../landing/HeroSection';
import { CampusExpenseCategoriesGrid } from '../landing/CampusExpenseCategoriesGrid';
import { PersonalVaultSection } from '../landing/PersonalVaultSection';
import { SharedLedgerSection } from '../landing/SharedLedgerSection';
import { SettlementSection } from '../landing/SettlementSection';
import { ProblemVsSolutionSection } from '../landing/ProblemVsSolutionSection';
import { HowItWorksSection } from '../landing/HowItWorksSection';
import { PlatformArchitectureGrid } from '../landing/PlatformArchitectureGrid';
import { FinalCTASection } from '../landing/FinalCTASection';
import { LandingFooter } from '../landing/LandingFooter';
import { SideloadGuideModal } from '../landing/SideloadGuideModal';
import { QrCodeModal } from '../landing/QrCodeModal';

interface DesktopLandingPageProps {
  onLoginSuccess: (adminUser: User) => void;
  onOpenMobilePreview: () => void;
  allUsers: User[];
}

export const DesktopLandingPage: React.FC<DesktopLandingPageProps> = ({
  onLoginSuccess,
  onOpenMobilePreview,
  allUsers,
}) => {
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);

  const handleDownloadApk = () => {
    // Direct link to production APK binary in public directory
    const link = document.createElement('a');
    link.href = '/RoomMate-latest.apk';
    link.download = 'RoomMate-staging-v1.0.4.apk';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-brand-surface text-brand-charcoal flex flex-col font-sans selection:bg-brand-mint selection:text-brand antialiased overflow-x-hidden">
      
      {/* 1. Header Navigation */}
      <LandingNavbar
        onOpenMobilePreview={onOpenMobilePreview}
        onOpenAdminModal={() => setIsAdminModalOpen(true)}
        onOpenGuide={() => setShowGuideModal(true)}
        onDownloadApk={handleDownloadApk}
      />

      {/* 2. Main Landing Page Sections */}
      <main className="flex-1">
        {/* Hero Section with Dual-View Centerpiece Mockup */}
        <HeroSection
          onOpenMobilePreview={onOpenMobilePreview}
          onDownloadApk={handleDownloadApk}
          onOpenGuide={() => setShowGuideModal(true)}
        />

        {/* Comparison: Spreadsheet Chaos vs RoomMate Standard - moved early */}
        <ProblemVsSolutionSection />

        {/* Campus Expense Categories Grid */}
        <CampusExpenseCategoriesGrid />

        {/* Feature Spotlight 1: Personal Vault */}
        <PersonalVaultSection />

        {/* Feature Spotlight 2: Shared Sync Ledger */}
        <SharedLedgerSection />

        {/* Feature Spotlight 3: Interactive Settlement Story Demo */}
        <SettlementSection />

        {/* How It Works (Dark Teal Finpay flow) */}
        <HowItWorksSection />

        {/* Native Platform Architecture */}
        <PlatformArchitectureGrid />

        {/* Final Call to Action Block */}
        <FinalCTASection
          onOpenMobilePreview={onOpenMobilePreview}
          onDownloadApk={handleDownloadApk}
        />
      </main>

      {/* 3. Main Footer */}
      <LandingFooter
        onOpenMobilePreview={onOpenMobilePreview}
        onOpenAdminModal={() => setIsAdminModalOpen(true)}
        onOpenGuide={() => setShowGuideModal(true)}
        onOpenQrModal={() => setShowQrModal(true)}
        onDownloadApk={handleDownloadApk}
      />

      {/* Sideload Installation Guide Modal */}
      <SideloadGuideModal
        isOpen={showGuideModal}
        onClose={() => setShowGuideModal(false)}
        onDownloadApk={handleDownloadApk}
      />

      {/* Scan Phone QR Code Modal */}
      <QrCodeModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
      />

      {/* Super Admin Login Modal */}
      {isAdminModalOpen && (
        <SuperAdminLoginModal
          isOpen={isAdminModalOpen}
          onClose={() => setIsAdminModalOpen(false)}
          onLoginSuccess={onLoginSuccess}
          allUsers={allUsers}
        />
      )}
    </div>
  );
};
