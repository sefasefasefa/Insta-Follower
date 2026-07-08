import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import { useLogin, useGetSession } from "@workspace/api-client-react";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Instagram, KeyRound } from "lucide-react";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  twoFactorCode: z.string().optional(),
});

export default function Login() {
  const [_, setLocation] = useLocation();
  const { data: session, isLoading: isCheckingSession } = useGetSession();
  const { toast } = useToast();
  const loginMutation = useLogin();
  const [needs2FA, setNeeds2FA] = useState(false);

  useEffect(() => {
    if (session?.loggedIn) {
      setLocation("/app");
    }
  }, [session, setLocation]);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
      twoFactorCode: "",
    },
  });

  if (isCheckingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (session?.loggedIn) return null;

  function onSubmit(values: z.infer<typeof loginSchema>) {
    loginMutation.mutate(
      {
        data: {
          username: values.username,
          password: values.password,
          twoFactorCode: values.twoFactorCode,
        },
      },
      {
        onSuccess: (data) => {
          if (data.requiresTwoFactor) {
            setNeeds2FA(true);
            toast({
              title: "Two-factor authentication required",
              description: "Please enter the code sent to your device.",
            });
          } else if (data.success && data.sessionId) {
            localStorage.setItem("instagram_session_id", data.sessionId);
            toast({
              title: "Success",
              description: "Logged in successfully.",
            });
            setLocation("/app");
          } else {
            toast({
              variant: "destructive",
              title: "Login failed",
              description: data.error || "An unexpected error occurred.",
            });
          }
        },
        onError: (error) => {
          toast({
            variant: "destructive",
            title: "Error",
            description: error.error || "Failed to login.",
          });
        },
      }
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative gradient orbs */}
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-orange-600/10 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-md relative z-10"
      >
        <Card className="border-white/5 bg-black/40 backdrop-blur-xl shadow-2xl shadow-purple-900/20">
          <CardHeader className="space-y-4 items-center text-center pb-8">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-orange-500 via-pink-500 to-purple-600 p-[2px] shadow-lg shadow-pink-500/20"
            >
              <div className="w-full h-full bg-black/80 rounded-[14px] flex items-center justify-center">
                <Instagram className="w-8 h-8 text-white" />
              </div>
            </motion.div>
            <div className="space-y-1">
              <CardTitle className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
                Story Liker
              </CardTitle>
              <CardDescription className="text-base text-white/50">
                Sign in with your Instagram account to view advanced analytics
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <AnimatePresence mode="popLayout">
                  {!needs2FA ? (
                    <motion.div
                      key="credentials"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="space-y-4"
                    >
                      <FormField
                        control={form.control}
                        name="username"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-white/70">Username</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Phone number, username, or email"
                                className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-purple-500/50 h-12"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-white/70">Password</FormLabel>
                            <FormControl>
                              <Input
                                type="password"
                                placeholder="Password"
                                className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-purple-500/50 h-12"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="2fa"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="space-y-4"
                    >
                      <div className="flex flex-col items-center justify-center py-4 text-center space-y-2">
                        <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center mb-2">
                          <KeyRound className="w-6 h-6 text-purple-400" />
                        </div>
                        <p className="text-sm text-white/70">
                          Enter the code sent to your authentication app or SMS to continue.
                        </p>
                      </div>
                      <FormField
                        control={form.control}
                        name="twoFactorCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-white/70">Security Code</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="000000"
                                className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-purple-500/50 h-12 text-center text-xl tracking-[0.5em]"
                                maxLength={6}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                <Button
                  type="submit"
                  disabled={loginMutation.isPending}
                  className="w-full h-12 text-base font-semibold"
                  variant="gradient"
                >
                  {loginMutation.isPending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : needs2FA ? (
                    "Verify & Login"
                  ) : (
                    "Log In"
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
