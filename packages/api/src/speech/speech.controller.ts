import { Controller, Get, NotFoundException, Param, ParseIntPipe, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { SPEECH_LANGS, SpeechLang, SpeechService } from './speech.service';

const lang = (value?: string): SpeechLang => ((SPEECH_LANGS as readonly string[]).includes(value ?? '') ? (value as SpeechLang) : 'fr');

/** Public like the room itself: only what the room already shows, translated and read aloud. */
@ApiTags('speech')
@Controller('speech')
export class SpeechController {
  constructor(private readonly speech: SpeechService) {}

  @Get('status')
  status() {
    return this.speech.status();
  }

  @Get('slots/:id')
  slot(@Param('id') id: string, @Query('lang') l?: string) {
    return this.speech.slot(id.slice(0, 64), lang(l));
  }

  @Get('slots/:id/audio/:index')
  async audio(
    @Param('id') id: string,
    @Param('index', ParseIntPipe) index: number,
    @Query('lang') l: string | undefined,
    @Res() res: Response,
  ) {
    const audio = await this.speech.audio(id.slice(0, 64), index, lang(l));
    if (!audio) throw new NotFoundException('Pas de voix naturelle disponible : la voix de l’appareil prend le relais.');
    res.set({ 'content-type': 'audio/mpeg', 'cache-control': 'public, max-age=604800' }).send(audio);
  }
}
