"use client";

import { useState, useTransition } from "react";
import { saveCustomization, type SaveResult } from "./actions";
import { SITE_URL } from "@/lib/config";
import type { Bot } from "@/lib/bot";

const field = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal";

export function CustomizeStep({ bot, defaultEmail }: { bot: Bot; defaultEmail: string }) {
  const [color, setColor] = useState(bot.brand_color);
  const [name, setName] = useState(bot.name);
  const [welcome, setWelcome] = useState(bot.welcome_message);
  const [logo, setLogo] = useState(bot.logo_url ?? "");
  const [position, setPosition] = useState(bot.bubble_position);
  const [res, setRes] = useState<SaveResult | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      action={(f) => start(async () => setRes(await saveCustomization(f)))}
      className="grid gap-6 md:grid-cols-[1fr_280px]"
    >
      <div className="space-y-4 text-sm">
        <label className="block font-medium">Assistant name<input name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={field} /></label>
        <label className="block font-medium">Welcome message<textarea name="welcome_message" value={welcome} onChange={(e) => setWelcome(e.target.value)} maxLength={300} rows={2} className={field} /></label>
        <div className="flex flex-wrap gap-6">
          <label className="block font-medium">Brand color<input type="color" name="brand_color" value={color} onChange={(e) => setColor(e.target.value)} className="mt-1 block h-10 w-20 rounded border border-slate-300" /></label>
          <fieldset className="font-medium">
            <legend>Bubble position</legend>
            <div className="mt-2 flex gap-4 font-normal">
              {(["right", "left"] as const).map((p) => (
                <label key={p} className="flex items-center gap-1"><input type="radio" name="bubble_position" value={p} checked={position === p} onChange={() => setPosition(p)} />Bottom {p}</label>
              ))}
            </div>
          </fieldset>
        </div>
        <label className="block font-medium">Logo link (optional)
          <span className="block text-xs font-normal text-slate-500">Right click your logo on your website, choose "Copy image address", and paste it here. Square images look best.</span>
          <input name="logo_url" value={logo} onChange={(e) => setLogo(e.target.value)} placeholder="https://yourbusiness.com/logo.png" className={field} />
        </label>
        <label className="block font-medium">Where should customer questions go?
          <span className="block text-xs font-normal text-slate-500">When the assistant hands a question to your team, the ticket is emailed here. Reply straight from your inbox to answer the customer.</span>
          <input name="handoff_email" type="email" required defaultValue={bot.handoff_email ?? defaultEmail} className={field} />
        </label>
        <label className="block font-medium">When does your team reply? (optional)
          <span className="block text-xs font-normal text-slate-500">Shown to customers after a handoff, for example "We reply within one business day, Monday to Friday."</span>
          <input name="hours_note" defaultValue={bot.hours_note ?? ""} maxLength={200} className={field} />
        </label>
        <label className="block font-medium">Topics your team always handles (optional)
          <span className="block text-xs font-normal text-slate-500">Comma separated. Questions mentioning these always go to a person, for example: wedding cake, refund, complaint.</span>
          <input name="custom_keywords" defaultValue={bot.custom_keywords.join(", ")} className={field} />
        </label>
        <label className="block font-medium">Help page address
          <span className="block text-xs font-normal text-slate-500">A public page with your assistant, for customers without your website open, QR codes or social media.</span>
          <span className="mt-1 flex items-center gap-1 font-normal"><span className="text-slate-500">{SITE_URL.replace(/^https?:\/\//, "")}/help/</span><input name="slug" defaultValue={bot.slug ?? ""} maxLength={40} className="flex-1 rounded-lg border border-slate-300 px-3 py-2" /></span>
        </label>
        <label className="block font-medium">Keep conversations for
          <select name="retention_days" defaultValue={bot.retention_days} className={field}>
            <option value={30}>30 days</option><option value={90}>90 days (recommended)</option><option value={365}>365 days</option>
          </select>
        </label>
        {res && <p className={`rounded-lg p-3 ${res.ok ? "bg-green-50 text-green-900" : "bg-red-50 text-red-800"}`}>{res.ok ? "Saved. Changes show in the chat right away." : res.error}</p>}
        <button disabled={pending} className="rounded-xl bg-indigo-600 px-4 py-2 font-medium text-white disabled:opacity-50">{pending ? "Saving..." : "Save"}</button>
      </div>

      <div aria-hidden className="relative h-[420px] rounded-2xl bg-slate-100 p-3 text-sm">
        <p className="text-xs text-slate-500">Preview</p>
        <div className={`absolute bottom-20 w-60 overflow-hidden rounded-2xl bg-white shadow-lg ${position === "left" ? "left-3" : "right-3"}`}>
          <div className="flex items-center gap-2 px-3 py-2 text-white" style={{ background: color }}>
            {logo && /^https:\/\//.test(logo) && <img src={logo} alt="" className="h-6 w-6 rounded bg-white object-cover" />}
            <span className="truncate font-medium">{name}</span>
          </div>
          <p className="m-3 rounded-xl bg-slate-50 p-2">{welcome}</p>
          <p className="mx-3 mb-3 text-center text-xs" style={{ color }}>Talk to a person</p>
        </div>
        <div className={`absolute bottom-4 grid h-12 w-12 place-items-center rounded-full text-white shadow-lg ${position === "left" ? "left-3" : "right-3"}`} style={{ background: color }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2z" /></svg>
        </div>
      </div>
    </form>
  );
}
