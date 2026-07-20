import { useI18n } from "../contexts/I18nContext";
import { SkeletonBar, SkeletonCircle, SkeletonList } from "./Skeleton";

function Surface({ children, className = "" }) {
  return <section className={`card p-5 ${className}`.trim()}>{children}</section>;
}

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <Surface className="min-h-[340px] flex flex-col items-center justify-center">
          <SkeletonBar width="92px" height={12} />
          <SkeletonBar width="220px" height={58} className="mt-5" />
          <div className="flex gap-2 mt-6">
            {Array.from({ length: 5 }).map((_, i) => <SkeletonCircle key={i} size={34} />)}
          </div>
          <SkeletonBar width="180px" height={44} className="mt-8" style={{ borderRadius: 14 }} />
        </Surface>
        <Surface>
          <SkeletonBar width="120px" height={12} className="mb-5" />
          <SkeletonList rows={3} avatar={24} lines={1} />
        </Surface>
      </div>
      <div className="space-y-5">
        <Surface className="min-h-[245px]">
          <SkeletonBar width="78px" height={10} />
          <SkeletonBar width="145px" height={42} className="mt-4" />
          <SkeletonBar height={9} className="mt-6" />
          <div className="grid grid-cols-2 gap-3 mt-6">
            <SkeletonBar height={42} /><SkeletonBar height={42} />
          </div>
        </Surface>
        <Surface>
          <SkeletonBar width="105px" height={12} className="mb-4" />
          <SkeletonList rows={3} avatar={26} lines={1} />
        </Surface>
      </div>
    </div>
  );
}

function PlanningSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2"><SkeletonBar width="150px" height={24} /><SkeletonBar width="210px" height={10} /></div>
        <SkeletonBar width="170px" height={38} style={{ borderRadius: 12 }} />
      </div>
      <Surface className="min-h-[160px]">
        <div className="flex gap-8"><SkeletonBar width="90px" height={45} /><SkeletonBar width="78px" height={45} /></div>
        <SkeletonList rows={2} avatar={18} lines={1} />
      </Surface>
      <Surface>
        <div className="flex items-center justify-between mb-5"><SkeletonBar width="130px" height={16} /><SkeletonBar width="190px" height={34} /></div>
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 42 }).map((_, i) => <SkeletonBar key={i} height={i < 7 ? 18 : 54} />)}
        </div>
      </Surface>
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="space-y-5">
      <div className="space-y-2"><SkeletonBar width="145px" height={24} /><SkeletonBar width="230px" height={10} /></div>
      <Surface>
        <SkeletonBar width="115px" height={11} className="mb-4" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonBar key={i} height={108} style={{ borderRadius: 14 }} />)}
        </div>
      </Surface>
      <div className="grid gap-5 lg:grid-cols-2">
        <Surface><SkeletonBar width="130px" height={13} /><SkeletonBar height={220} className="mt-5" /></Surface>
        <Surface><SkeletonBar width="110px" height={13} /><div className="flex items-end gap-3 h-[220px] mt-5">{[48, 75, 58, 92, 64, 82, 55].map((h, i) => <SkeletonBar key={i} width="14%" height={`${h}%`} />)}</div></Surface>
      </div>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-5">
      <Surface className="overflow-hidden p-0">
        <div className="bt-skeleton h-24 rounded-none" />
        <div className="px-6 pb-6">
          <div className="flex items-end gap-4 -mt-8"><SkeletonCircle size={86} /><div className="space-y-2 pb-2"><SkeletonBar width="155px" height={21} /><SkeletonBar width="95px" height={10} /></div></div>
          <div className="grid grid-cols-2 gap-3 mt-6 sm:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <SkeletonBar key={i} height={72} />)}</div>
        </div>
      </Surface>
      <div className="grid gap-5 lg:grid-cols-2">
        <Surface><SkeletonBar width="130px" height={15} className="mb-5" /><SkeletonBar height={12} /><SkeletonList rows={3} avatar={24} lines={1} /></Surface>
        <Surface><SkeletonBar width="105px" height={15} className="mb-5" /><div className="grid grid-cols-4 gap-3">{Array.from({ length: 8 }).map((_, i) => <SkeletonCircle key={i} size={48} />)}</div></Surface>
      </div>
    </div>
  );
}

function SocialSkeleton() {
  return (
    <div className="space-y-5">
      <div className="space-y-2"><SkeletonBar width="130px" height={24} /><SkeletonBar width="245px" height={10} /></div>
      <div className="grid min-h-[580px] gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Surface><SkeletonBar width="125px" height={13} className="mb-5" /><SkeletonList rows={7} avatar={38} lines={2} /></Surface>
        <Surface className="flex flex-col"><div className="flex items-center gap-3"><SkeletonCircle size={40} /><div className="space-y-2"><SkeletonBar width="130px" height={12} /><SkeletonBar width="80px" height={8} /></div></div><div className="flex-1 space-y-4 py-8"><SkeletonBar width="62%" height={46} /><SkeletonBar width="48%" height={58} className="ml-auto" /><SkeletonBar width="56%" height={42} /></div><SkeletonBar height={46} style={{ borderRadius: 14 }} /></Surface>
      </div>
    </div>
  );
}

function contentFor(pathname) {
  if (pathname === "/planning") return <PlanningSkeleton />;
  if (pathname === "/stats") return <StatsSkeleton />;
  if (pathname === "/profile") return <ProfileSkeleton />;
  if (["/messages", "/feed", "/communautes", "/friends"].includes(pathname)) return <SocialSkeleton />;
  return <DashboardSkeleton />;
}

export default function PageSkeleton({ pathname = "/dashboard" }) {
  const { t } = useI18n();
  return (
    <div className="bt-app-shell min-h-screen" style={{ backgroundColor: "var(--bt-bg)" }} role="status" aria-live="polite" aria-label={t("loading.preparing")}>
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-[232px] flex-col p-5" style={{ backgroundColor: "var(--bt-surface)", borderRight: "1px solid var(--bt-border)" }}>
        <SkeletonBar width="145px" height={22} className="mb-8" />
        <div className="space-y-3">{Array.from({ length: 8 }).map((_, i) => <SkeletonBar key={i} width={i % 3 === 0 ? "82%" : "100%"} height={38} style={{ borderRadius: 12 }} />)}</div>
        <div className="mt-auto flex items-center gap-3"><SkeletonCircle size={34} /><div className="flex-1 space-y-2"><SkeletonBar width="80%" height={10} /><SkeletonBar width="55%" height={8} /></div></div>
      </aside>
      <header className="lg:hidden h-12 px-4 flex items-center justify-between sticky top-0" style={{ backgroundColor: "var(--bt-mobile-bg)", borderBottom: "1px solid var(--bt-border)" }}>
        <SkeletonBar width="130px" height={18} /><SkeletonCircle size={30} />
      </header>
      <div className="lg:ml-[232px]">
        <main data-bt-route-content className="w-full max-w-[1280px] mx-auto px-5 pt-7 pb-28 lg:px-9 lg:pb-10">
          {contentFor(pathname)}
        </main>
      </div>
      <nav className="lg:hidden fixed bottom-0 inset-x-0 h-14 px-5 flex items-center justify-around" style={{ backgroundColor: "var(--bt-mobile-nav-bg)", borderTop: "1px solid var(--bt-border)" }}>
        {Array.from({ length: 5 }).map((_, i) => <SkeletonCircle key={i} size={26} />)}
      </nav>
      <span className="sr-only">{t("loading.preparing")}</span>
    </div>
  );
}
