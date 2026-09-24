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
import { DownloadConfirmationModal } from '../landing/DownloadConfirmationModal';

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
  const [showDownloadConfirmModal, setShowDownloadConfirmModal] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('action') === 'download' || params.get('download') === 'apk';
  });

  // Clean URL parameters after detecting download trigger so refreshes stay clean
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('action') === 'download' || params.get('download') === 'apk') {
        params.delete('action');
        params.delete('download');
        const newQuery = params.toString();
        const newUrl = window.location.pathname + (newQuery ? `?${newQuery}` : '') + window.location.hash;
        window.history.replaceState({}, '', newUrl);
      }
    }
  }, []);

  const handleDownloadApk = () => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://pbzaaskftrmnvocczhat.supabase.co';
    const APK_DOWNLOAD_URL = `${supabaseUrl}/storage/v1/object/public/app-updates/releases/staging/RoomMate-staging-latest.apk`;
    const link = document.createElement('a');
    link.href = APK_DOWNLOAD_URL;
    link.download = 'RoomMate-staging-v1.0.4-build10.apk';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const openDownloadModal = () => {
    setShowDownloadConfirmModal(true);
  };

  return (
    <div className="min-h-screen bg-brand-surface text-brand-charcoal flex flex-col font-sans selection:bg-brand-mint selection:text-brand antialiased overflow-x-hidden">
      
      {/* 1. Header Navigation */}
      <LandingNavbar
        onOpenMobilePreview={onOpenMobilePreview}
        onOpenAdminModal={() => setIsAdminModalOpen(true)}
        onOpenGuide={() => setShowGuideModal(true)}
        onOpenQrModal={() => setShowQrModal(true)}
        onDownloadApk={openDownloadModal}
      />

      {/* 2. Main Landing Page Sections */}
      <main className="flex-1">
        {/* Hero Section with Dual-View Centerpiece Mockup */}
        <HeroSection
          onOpenMobilePreview={onOpenMobilePreview}
          onDownloadApk={openDownloadModal}
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
          onDownloadApk={openDownloadModal}
        />
      </main>

      {/* 3. Main Footer */}
      <LandingFooter
        onOpenMobilePreview={onOpenMobilePreview}
        onOpenAdminModal={() => setIsAdminModalOpen(true)}
        onOpenGuide={() => setShowGuideModal(true)}
        onOpenQrModal={() => setShowQrModal(true)}
        onDownloadApk={openDownloadModal}
      />

      {/* Download Confirmation Modal (Direct & QR Scan Trigger) */}
      <DownloadConfirmationModal
        isOpen={showDownloadConfirmModal}
        onClose={() => setShowDownloadConfirmModal(false)}
        onDownload={handleDownloadApk}
        onOpenGuide={() => setShowGuideModal(true)}
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
