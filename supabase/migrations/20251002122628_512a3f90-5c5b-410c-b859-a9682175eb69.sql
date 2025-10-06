-- Create promo_codes table
CREATE TABLE public.promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  uses_count integer DEFAULT 0 NOT NULL,
  max_uses integer DEFAULT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

-- Allow public to read active promo codes for validation
CREATE POLICY "Anyone can read active promo codes"
  ON public.promo_codes
  FOR SELECT
  USING (is_active = true);

-- Insert the IBIZA2025 promo code
INSERT INTO public.promo_codes (code, is_active, max_uses)
VALUES ('IBIZA2025', true, NULL);

-- Update profiles table to track promo code usage
ALTER TABLE public.profiles
ADD COLUMN promo_code_used text DEFAULT NULL;

-- Create function to increment promo code usage
CREATE OR REPLACE FUNCTION public.increment_promo_use(promo_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.promo_codes
  SET uses_count = uses_count + 1
  WHERE code = promo_code AND is_active = true;
  
  RETURN FOUND;
END;
$$;