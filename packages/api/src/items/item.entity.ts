import { Tag } from '../tags/tag.entity';

export interface Item {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  tags: Tag[];
}
