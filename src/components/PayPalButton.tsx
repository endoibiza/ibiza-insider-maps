import React from 'react';
import { Button } from '@/components/ui/button';
import { CreditCard } from 'lucide-react';

interface PayPalButtonProps {
  onSuccess: (paymentId: string) => void;
  onError: (error: string) => void;
}

const PayPalButton: React.FC<PayPalButtonProps> = ({ onSuccess, onError }) => {
  const handlePayment = () => {
    // PayPal integration - for now, simulate payment
    const paymentId = `pp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // In production, this would integrate with PayPal's SDK
    const confirmed = window.confirm(
      "💳 PayPal Payment Simulation\n\nPrice: €29.99 (one-time)\nProduct: Ibiza Insider Premium Access\n\nClick OK to simulate successful payment."
    );
    
    if (confirmed) {
      onSuccess(paymentId);
    } else {
      onError("Payment cancelled");
    }
  };

  return (
    <Button 
      onClick={handlePayment}
      size="lg"
      className="w-full bg-[#0070ba] hover:bg-[#005ea6] text-white font-semibold py-4"
    >
      <CreditCard className="w-5 h-5 mr-2" />
      Pay €29.99 with PayPal
    </Button>
  );
};

export default PayPalButton;