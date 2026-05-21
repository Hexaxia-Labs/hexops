'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

interface CategoryContextValue {
  selectedCategory: string | null;
  setSelectedCategory: (cat: string | null) => void;
}

const CategoryContext = createContext<CategoryContextValue>({
  selectedCategory: null,
  setSelectedCategory: () => {},
});

export function CategoryProvider({ children }: { children: ReactNode }) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  return (
    <CategoryContext.Provider value={{ selectedCategory, setSelectedCategory }}>
      {children}
    </CategoryContext.Provider>
  );
}

export function useCategory() {
  return useContext(CategoryContext);
}
