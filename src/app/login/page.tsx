import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Login — Social Media Agent",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-8 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Social Media Agent</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Enter your password to continue
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
