import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { FilesService } from '../storage/files.service';
import { CommunityDocument } from './community-document.entity';

const DOCUMENT_COLUMNS = 'id, community_id, file_id, title, uploaded_by, created_at';

/**
 * docs/01_FUNCTIONAL_SPECIFICATION.md §8.2 lists "Documents" as one of a community's five content
 * types (Fil d'actualité, Annonces, Programme, Documents, Membres) — the only one never built.
 * A brand-new, isolated table joining the existing `files` table; the file itself is uploaded via
 * the existing presign flow (FilesService), this table just links it to a community with a title.
 */
@Injectable()
export class CommunityDocumentsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly filesService: FilesService,
  ) {}

  private get db() {
    return this.supabase.client.from('community_documents');
  }

  async create(communityId: string, uploadedBy: string, fileId: string, title: string): Promise<CommunityDocument> {
    const { data, error } = await this.db
      .insert({ community_id: communityId, file_id: fileId, title, uploaded_by: uploadedBy })
      .select(DOCUMENT_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as CommunityDocument;
  }

  async list(communityId: string): Promise<CommunityDocument[]> {
    const { data, error } = await this.db
      .select(DOCUMENT_COLUMNS)
      .eq('community_id', communityId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as CommunityDocument[];
  }

  async findById(id: string): Promise<CommunityDocument> {
    const { data, error } = await this.db.select(DOCUMENT_COLUMNS).eq('id', id).is('deleted_at', null).maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException(`Document ${id} not found`);
    return data as unknown as CommunityDocument;
  }

  /** Owner-agnostic: any community member can read a document, not just its uploader — see FilesService.getPublicReadUrl. */
  async getReadUrl(id: string): Promise<string | null> {
    const document = await this.findById(id);
    return this.filesService.getPublicReadUrl(document.file_id);
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    const { error } = await this.db.update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) throw new InternalServerErrorException(error.message);
  }
}
