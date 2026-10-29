import type {
  ApplyChannel,
  OfferLanguage,
  OfferSource,
} from '../entities/offer.entity.js';

export interface OfferDto {
  id: string;
  source: OfferSource;
  createdByUserId: string | null;
  title: string;
  company: string | null;
  location: string | null;
  language: OfferLanguage;
  country: string;
  description: string;
  applyUrl: string | null;
  applyChannel: ApplyChannel;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedOffersDto {
  items: OfferDto[];
  total: number;
  limit: number;
  offset: number;
}
