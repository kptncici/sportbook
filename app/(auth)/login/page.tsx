"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.email || !form.password) {
      alert("Email dan password harus diisi!");
      return;
    }

    setLoading(true);

    try {
      await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: true,
        callbackUrl: "/dashboard",
      });
    } catch (err) {
      console.error("Login error:", err);
      alert("Terjadi kesalahan server!");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center h-screen bg-gradient-to-br from-blue-700 to-blue-900">
      <form
        onSubmit={handleSubmit}
        className="space-y-5 p-8 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl w-80 shadow-xl text-white animate-fade-in"
      >
        <h1 className="text-2xl font-bold text-center tracking-wide drop-shadow-md">
          SPORTBOOK LOGIN
        </h1>

        <Input
          className="bg-white/20 text-white placeholder-white/60 border-white/30 focus:ring-white"
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />

        <Input
          className="bg-white/20 text-white placeholder-white/60 border-white/30 focus:ring-white"
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />

        {/* Link Lupa Password */}
        <p
          className="text-sm text-blue-300 hover:text-blue-200 cursor-pointer text-right -mt-2"
          onClick={() => router.push("/forgot-password")}
        >
          Lupa Password?
        </p>

        <Button
          className="w-full bg-green-500 hover:bg-green-600 text-white py-2 rounded-lg shadow-lg transition-all"
          disabled={loading}
          type="submit"
        >
          {loading ? "Memproses..." : "Login"}
        </Button>

        {/* Register */}
        <div className="text-center text-sm text-gray-200 pt-2">
          Belum punya akun?{" "}
          <span
            onClick={() => router.push("/register")}
            className="text-green-300 cursor-pointer hover:text-green-200"
          >
            Daftar
          </span>
        </div>
      </form>
    </div>
  );
}
