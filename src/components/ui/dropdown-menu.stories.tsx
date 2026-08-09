import * as React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { SPACES } from "@/stories/fixtures";

/**
 * Radix dropdown menu. In a console this is the **row-action** control: the
 * two or three things you can do to one item, tucked behind a quiet trigger so
 * the list itself stays scannable.
 *
 * Destructive entries get `--destructive` and sit last, after a separator —
 * far enough from the safe actions that a mis-click is unlikely.
 */
const meta = {
  title: "Primitives/Dropdown menu",
  component: DropdownMenu,
  parameters: { layout: "centered" },
} satisfies Meta<typeof DropdownMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RowActions: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Memory actions">
          <Icon.sliders />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Memory</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Icon.graph className="size-4" />
          Open in graph
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Icon.document className="size-4" />
          View sources
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Icon.clock className="size-4" />
          Version history
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive">
          <Icon.forget className="size-4" />
          Forget
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

/** Checkbox items for a filter menu — state stays visible while you toggle. */
export const FilterMenu: Story = {
  render: function FilterMenu() {
    const [active, setActive] = React.useState<string[]>([
      SPACES[0].containerTag,
    ]);
    const toggle = (tag: string) =>
      setActive((s) =>
        s.includes(tag) ? s.filter((t) => t !== tag) : [...s, tag],
      );

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            <Icon.filter />
            Spaces
            {active.length > 0 && (
              <span className="tnum ml-1 text-brand-black/45">
                {active.length}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Filter by space</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {SPACES.map((s) => (
            <DropdownMenuCheckboxItem
              key={s.containerTag}
              checked={active.includes(s.containerTag)}
              onCheckedChange={() => toggle(s.containerTag)}
              onSelect={(e) => e.preventDefault()}
            >
              {s.name}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
};
