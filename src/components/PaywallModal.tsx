import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import PayPalButton from '@/components/PayPalButton';
import { 
  Crown, 
  MapPin, 
  Star, 
  Check, 
  X,
  Sparkles
} from 'lucide-react';

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

  const handlePaymentSuccess = async (paymentId: string) => {
    setIsProcessing(true);
    try {
      await grantPremiumAccess(paymentId);
      toast({
        title: "Welcome to Ibiza Insider Premium! 🎉",
        description: "You now have lifetime access to all premium content.",
      });
      onClose();
    } catch (error) {
      toast({
        title: "Payment processed, but there was an issue",
        description: "Please contact support if access isn't granted shortly.",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePaymentError = (error: string) => {
    toast({
      title: "Payment failed",
      description: error,
      variant: "destructive"
    });
  };

  const features = [
    "Access to 80+ curated Ibiza locations",
    "Interactive maps with all venues",
    "Detailed category browsing",
    "Mobile-optimized experience",
    "Lifetime access - pay once, use forever",
    "Regular updates with new locations"
  ];

  const freeFeatures = [
    "Limited preview of locations",
    "Basic category overview"
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md mx-auto max-h-[90vh] overflow-y-auto">
        <DialogHeader className="text-center pb-2">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-primary to-primary/70 rounded-full flex items-center justify-center mb-4">
            <Crown className="w-8 h-8 text-primary-foreground" />
          </div>
          <DialogTitle className="text-2xl font-bold">
            Unlock Ibiza Insider Premium
          </DialogTitle>
          <p className="text-muted-foreground">
            Get lifetime access to our complete Ibiza guide
          </p>
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

          {/* Features */}
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

          {/* Free vs Premium comparison */}
          <div className="border-t pt-4">
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <h5 className="font-medium mb-2 text-muted-foreground">Free Access</h5>
                {freeFeatures.map((feature, index) => (
                  <div key={index} className="flex items-start gap-2 mb-1">
                    <X className="w-3 h-3 text-red-400 mt-0.5" />
                    <span className="text-muted-foreground">{feature}</span>
                  </div>
                ))}
              </div>
              <div>
                <h5 className="font-medium mb-2 text-primary">Premium Access</h5>
                <div className="flex items-start gap-2 mb-1">
                  <Check className="w-3 h-3 text-green-500 mt-0.5" />
                  <span>Complete access</span>
                </div>
                <div className="flex items-start gap-2">
                  <Star className="w-3 h-3 text-yellow-500 mt-0.5" />
                  <span>Lifetime updates</span>
                </div>
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
                  Please sign in to purchase premium access
                </p>
                <Button onClick={() => { onClose(); navigate('/auth'); }} variant="outline">
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
            <p>🔒 Secure payment • 30-day money-back guarantee</p>
            <p className="mt-1">PayPal Buyer Protection included</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PaywallModal;