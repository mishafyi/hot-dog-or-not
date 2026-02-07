"use client";

import { SetStateAction, useState, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

const CheckIcon: React.FC<React.SVGProps<SVGSVGElement> & { size?: number }> = ({
  className,
  size = 20,
  ...props
}) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" className={className} {...props}>
    <path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
  </svg>
);

const XIcon: React.FC<React.SVGProps<SVGSVGElement> & { size?: number }> = ({
  className,
  size = 20,
  ...props
}) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" className={className} {...props}>
    <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
  </svg>
);

const AlertIcon: React.FC<React.SVGProps<SVGSVGElement> & { size?: number }> = ({
  className,
  size = 20,
  ...props
}) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" className={className} {...props}>
    <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
  </svg>
);

const GridIcon: React.FC<React.SVGProps<SVGSVGElement> & { size?: number }> = ({
  className,
  size = 20,
  ...props
}) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" className={className} {...props}>
    <path fill="currentColor" d="M3 3v8h8V3H3zm6 6H5V5h4v4zm-6 4v8h8v-8H3zm6 6H5v-4h4v4zm4-16v8h8V3h-8zm6 6h-4V5h4v4zm-6 4v8h8v-8h-8zm6 6h-4v-4h4v4z" />
  </svg>
);

interface Tab {
  id: string;
  title: string;
  icon: React.FC<React.SVGProps<SVGSVGElement> & { size?: number }>;
}

const PREDICTION_TABS: Tab[] = [
  { id: "all", title: "All", icon: GridIcon },
  { id: "correct", title: "Correct", icon: CheckIcon },
  { id: "incorrect", title: "Wrong", icon: XIcon },
  { id: "error", title: "Errors", icon: AlertIcon },
];

interface DiscreteTabsProps {
  value: string;
  onValueChange: (value: string) => void;
  tabs?: Tab[];
  counts?: Record<string, number>;
}

export function DiscreteTabs({ value, onValueChange, tabs = PREDICTION_TABS, counts }: DiscreteTabsProps) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <div className="flex gap-3 items-center">
      {tabs.map((tab) => (
        <TabButton
          key={tab.id}
          title={tab.title}
          ButtonIcon={tab.icon}
          isActive={value === tab.id}
          onClick={() => onValueChange(tab.id)}
          reducedMotion={!!prefersReducedMotion}
          count={counts?.[tab.id]}
        />
      ))}
    </div>
  );
}

function TabButton({
  title,
  ButtonIcon,
  isActive,
  onClick,
  reducedMotion,
  count,
}: {
  title: string;
  ButtonIcon: React.ComponentType<React.SVGProps<SVGSVGElement> & { size?: number }>;
  isActive: boolean;
  onClick: () => void;
  reducedMotion: boolean;
  count?: number;
}) {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  return (
    <motion.div
      layoutId={"tab-btn-" + title}
      transition={{
        layout: reducedMotion ? { duration: 0 } : {
          type: "spring",
          damping: 20,
          stiffness: 230,
          mass: 1.2,
        },
      }}
      onClick={onClick}
      className="w-fit h-fit flex"
      style={{ willChange: "transform" }}
    >
      <motion.div
        layout
        transition={{
          layout: reducedMotion ? { duration: 0 } : {
            type: "spring",
            damping: 20,
            stiffness: 230,
            mass: 1.2,
          },
        }}
        className={cn(
          "flex items-center gap-1.5 bg-secondary outline outline-2 outline-background overflow-hidden shadow-md transition-colors p-3 cursor-pointer",
          isActive && "text-primary",
          isActive ? "px-4" : "px-3"
        )}
        style={{ borderRadius: "25px" }}
      >
        <motion.div
          layoutId={"tab-icon-" + title}
          className="shrink-0"
          style={{ willChange: "transform" }}
        >
          <ButtonIcon size={20} />
        </motion.div>
        {isActive && (
          <motion.div
            className="flex items-center"
            initial={isLoaded ? { opacity: 0, filter: "blur(4px)" } : false}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            transition={{
              duration: isLoaded ? 0.2 : 0,
              ease: [0.86, 0, 0.07, 1],
            }}
          >
            <motion.span
              layoutId={"tab-text-" + title}
              className="text-sm font-medium whitespace-nowrap"
              style={{ willChange: "transform" }}
            >
              {title}{count !== undefined && ` (${count})`}
            </motion.span>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}
