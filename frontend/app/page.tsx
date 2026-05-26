import { Header } from '@/components/landing/Header';
import { HeroSection } from '@/components/landing/HeroSection';
import { ProblemSection } from '@/components/landing/ProblemSection';
import { SolutionSection } from '@/components/landing/SolutionSection';
import { FeaturesSection } from '@/components/landing/FeaturesSection';
import { HowItWorksSection } from '@/components/landing/HowItWorksSection';
import { ForWhomSection } from '@/components/landing/ForWhomSection';
import { AIAssistantSection } from '@/components/landing/AIAssistantSection';
import { FreelancerEcosystemSection } from '@/components/landing/FreelancerEcosystemSection';
import { FinalCTASection } from '@/components/landing/FinalCTASection';
import { Footer } from '@/components/landing/Footer';

export default function LandingPage() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <Header />
      <main className="flex-1">
        <HeroSection />
        <ProblemSection />
        <SolutionSection />
        <FeaturesSection />
        <HowItWorksSection />
        <ForWhomSection />
        <AIAssistantSection />
        <FreelancerEcosystemSection />
        <FinalCTASection />
      </main>
      <Footer />
    </div>
  );
}
