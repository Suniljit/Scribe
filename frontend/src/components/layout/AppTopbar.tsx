import { Moon, PanelLeft, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";

export function AppTopbar({
  title,
  sidebarCollapsed,
  onToggleSidebar,
}: {
  title: string;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-hairline bg-glass px-3 backdrop-blur-xl">
      <Button variant="ghost" size="icon-sm" onClick={onToggleSidebar} title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}>
        <PanelLeft className="size-4" />
      </Button>
      <span className="flex-1 truncate text-center text-[13px] font-semibold text-muted-foreground">{title}</span>
      <Button variant="ghost" size="icon-sm" onClick={toggleTheme} title="Toggle theme">
        {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </Button>
    </div>
  );
}
