import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(6, 'Password must be at least 6 characters.'),
});

export const registerSchema = z
  .object({
    full_name: z.string().min(2, 'Enter your name.').max(80),
    email: z.string().email('Enter a valid email address.'),
    password: z.string().min(6, 'Password must be at least 6 characters.'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export const analyzeSchema = z.object({
  url: z
    .string()
    .min(1, 'Enter a URL to analyze.')
    .refine(
      (v) => {
        const withProto = v.includes('://') ? v : `https://${v}`;
        try {
          // eslint-disable-next-line no-new
          new URL(withProto);
          return true;
        } catch {
          return false;
        }
      },
      { message: 'Enter a valid URL.' },
    ),
});

export const reportSchema = z.object({
  reason: z.string().min(1, 'Please select a reason.'),
  note: z.string().max(500, 'Note must be under 500 characters.').optional().or(z.literal('')),
});

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;
export type AnalyzeValues = z.infer<typeof analyzeSchema>;
export type ReportValues = z.infer<typeof reportSchema>;
