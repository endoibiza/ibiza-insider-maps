import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import PayPalButton from '@/components/PayPalButton';
import { 
  Crown, 
  Check, 
  Sparkles
} from 'lucide-react';
import { ANALYTICS_EVENTS, getSafeErrorType, track } from '@/lib/analytics';

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  featureName?: string;
}

const PaywallModal: React.FC<PaywallModalProps> = ({ 
  isOpen, 
  onClose, 
  featureName = "premium content" 
}) => {
  const { user, grantPremiumAccess } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpen.current) {
      track(ANALYTICS_EVENTS.paywallViewed, {
        source: "paywall_modal",
        feature_name: featureName,
      });
    }

    wasOpen.current = isOpen;
  }, [featureName, isOpen]);

  const handlePaymentSuccess = async (paymentId: string) => {
    setIsProcessing(true);
    try {
      await grantPremiumAccess(paymentId);
      track(ANALYTICS_EVENTS.paymentCompleted, {
        source: "paywall_modal",
        feature_name: featureName,
        amount: 29.99,
        currency: "EUR",
        payment_method: "paypal",
      });
      toast({
        title: "Welcome to Ibiza Maps",
        description: "You now have lifetime access to the full Ibiza Maps collection.",
      });
      onClose();
    } catch (error) {
      toast({
        title: "Payment processed, but there was an issue",
        description: "Please contact support if access isn't granted shortly.",
        variant: "destructive"
      });
      track(ANALYTICS_EVENTS.paymentFailed, {
        source: "paywall_modal",
        feature_name: featureName,
        payment_method: "paypal",
        error_type: getSafeErrorType(error),
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePaymentError = (error: string) => {
    const eventName = error.toLowerCase().includes("cancel")
      ? ANALYTICS_EVENTS.paymentCancelled
      : ANALYTICS_EVENTS.paymentFailed;

    track(eventName, {
      source: "paywall_modal",
      feature_name: featureName,
      payment_method: "paypal",
      error_type: eventName === ANALYTICS_EVENTS.paymentCancelled ? "payment_cancelled" : "payment_error",
    });
    toast({
      title: "Payment failed",
      description: error,
      variant: "destructive"
    });
  };

  const features = [
    "87+ curated Google Maps",
    "1,500+ Ibiza places across beaches, food, clubs, hotels, shopping, and local finds",
    "Works in Google Maps - no new app to learn",
    "Useful before you land and while you are here",
    "Lifetime access - pay once, use every trip"
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md mx-auto max-h-[90vh] overflow-y-auto">
        <DialogHeader className="text-center pb-2">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-primary to-primary/70 rounded-full flex items-center justify-center mb-4">
            <Crown className="w-8 h-8 text-primary-foreground" />
          </div>
          <DialogTitle className="text-2xl font-bold">
            Get the Full Ibiza Maps Collection
          </DialogTitle>
          <DialogDescription>
            87+ curated Google Maps and 1,500+ Ibiza places, organized so you know where to go.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Pricing */}
          <div className="text-center p-6 bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg border border-primary/20">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Badge variant="secondary" className="bg-primary/20 text-primary">
                <Sparkles className="w-3 h-3 mr-1" />
                One-time payment
              </Badge>
            </div>
            <div className="text-3xl font-bold text-primary">€29.99</div>
            <div className="text-sm text-muted-foreground">Lifetime access</div>
          </div>

          <div className="space-y-4">
            <h4 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
              What's included:
            </h4>
            <div className="space-y-2">
              {features.map((feature, index) => (
                <div key={index} className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">{feature}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border bg-muted/40 p-4">
            <h4 className="font-semibold text-sm mb-3">How access works</h4>
            <div className="grid gap-2 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-500 mt-0.5" />
                <span>Pay once - €29.99.</span>
              </div>
              <div className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-500 mt-0.5" />
                <span>Verify your email.</span>
              </div>
              <div className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-500 mt-0.5" />
                <span>Open the maps in Google Maps.</span>
              </div>
            </div>
          </div>

          {/* Payment */}
          <div className="space-y-3">
            {user ? (
              <PayPalButton 
                onSuccess={handlePaymentSuccess}
                onError={handlePaymentError}
              />
            ) : (
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground mb-3">
                  Sign in to connect lifetime access to your email.
                </p>
                <Button onClick={() => {
                  track(ANALYTICS_EVENTS.paywallCtaClicked, {
                    source: "paywall_modal",
                    location: "sign_in_first",
                    feature_name: featureName,
                  });
                  onClose();
                  navigate('/auth');
                }} variant="outline">
                  Sign In First
                </Button>
              </div>
            )}
            
            {isProcessing && (
              <div className="text-center py-2">
                <div className="text-sm text-muted-foreground">
                  Processing your payment...
                </div>
              </div>
            )}
          </div>

          {/* Trust indicators */}
          <div className="text-center text-xs text-muted-foreground border-t pt-4">
            <p>No subscription. No new app to learn.</p>
            <p className="mt-1">Secure payment through PayPal.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PaywallModal;
