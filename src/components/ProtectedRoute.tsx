import React from 'react';
import { useAuth } from '@/components/AuthProvider';
import PaywallModal from '@/components/PaywallModal';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiresPremium?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  requiresPremium = false 
}) => {
  const { user, hasPremiumAccess } = useAuth();
  const [showPaywall, setShowPaywall] = React.useState(false);

  React.useEffect(() => {
    if (requiresPremium && user && !hasPremiumAccess) {
      setShowPaywall(true);
    }
  }, [requiresPremium, user, hasPremiumAccess]);

  if (requiresPremium && user && !hasPremiumAccess) {
    return (
      <>
        {children}
        <PaywallModal 
          isOpen={showPaywall}
          onClose={() => setShowPaywall(false)}
        />
      </>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;