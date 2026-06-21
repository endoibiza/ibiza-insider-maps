import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { ANALYTICS_EVENTS, getSafeErrorType, track } from '@/lib/analytics';

type AuthActionResult = Promise<{ error: unknown }>;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  hasPremiumAccess: boolean;
  loading: boolean;
  signUp: (email: string, password: string, promoCode?: string) => AuthActionResult;
  signIn: (email: string, password: string) => AuthActionResult;
  signOut: () => Promise<void>;
  grantPremiumAccess: (paymentId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [hasPremiumAccess, setHasPremiumAccess] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Check premium access when user changes
        if (session?.user) {
          setTimeout(() => {
            checkPremiumAccess(session.user.id);
          }, 0);
        } else {
          setHasPremiumAccess(false);
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        checkPremiumAccess(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkPremiumAccess = async (userId: string) => {
    if (import.meta.env.DEV && import.meta.env.VITE_FORCE_PREMIUM_ACCESS !== "false") {
      setHasPremiumAccess(true);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('has_premium_access')
        .eq('user_id', userId)
        .maybeSingle();

      if (!error && data) {
        setHasPremiumAccess(data.has_premium_access);
      }
    } catch (error) {
      console.error('Error checking premium access:', error);
      track(ANALYTICS_EVENTS.loginFailed, {
        source: "premium_access_check",
        error_type: getSafeErrorType(error),
      });
    }
  };

  const signUp = async (email: string, password: string, promoCode?: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl
      }
    });

    // Create profile after signup
    if (!error) {
      setTimeout(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          let hasPremium = false;
          let usedPromoCode = null;

          // Validate and apply promo code if provided
          if (promoCode) {
            try {
              const { data: validationData } = await supabase.functions.invoke('validate-promo-code', {
                body: { code: promoCode }
              });

              if (validationData?.valid) {
                hasPremium = true;
                usedPromoCode = validationData.code;
                
                // Increment promo code usage
                await supabase.rpc('increment_promo_use', { 
                  promo_code: validationData.code 
                });
              }
            } catch (err) {
              console.error('Error applying promo code:', err);
              track(ANALYTICS_EVENTS.signupFailed, {
                source: "promo_code_validation",
                has_promo_code: true,
                error_type: getSafeErrorType(err),
              });
            }
          }

          await supabase.from('profiles').insert({
            user_id: user.id,
            email: user.email || email,
            has_premium_access: hasPremium,
            promo_code_used: usedPromoCode
          });

          if (hasPremium) {
            setHasPremiumAccess(true);
          }
        }
      }, 100);
    }

    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setHasPremiumAccess(false);
  };

  const grantPremiumAccess = async (paymentId: string) => {
    if (!user) return;

    try {
      // Record payment
      await supabase.from('payments').insert({
        user_id: user.id,
        payment_id: paymentId,
        payment_status: 'completed',
        amount: 29.99,
        currency: 'EUR',
        payment_method: 'paypal'
      });

      // Grant premium access
      await supabase
        .from('profiles')
        .update({ 
          has_premium_access: true,
          payment_id: paymentId 
        })
        .eq('user_id', user.id);

      setHasPremiumAccess(true);
      track(ANALYTICS_EVENTS.premiumAccessGranted, {
        source: "payment",
        amount: 29.99,
        currency: "EUR",
        payment_method: "paypal",
      });
    } catch (error) {
      console.error('Error granting premium access:', error);
      track(ANALYTICS_EVENTS.paymentFailed, {
        source: "premium_access_grant",
        payment_method: "paypal",
        error_type: getSafeErrorType(error),
      });
      throw error;
    }
  };

  const value = {
    user,
    session,
    hasPremiumAccess,
    loading,
    signUp,
    signIn,
    signOut,
    grantPremiumAccess
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
