import { Pipe, PipeTransform } from '@angular/core';
import { timezoneWithOffset } from './timezone';

// Usage: {{ company.timezone | tzLabel }}  ->  "Asia/Kuala_Lumpur (UTC +08:00)"
//
// The single app-wide way to render an IANA timezone with its standard UTC offset.
// Pure: the offset for a given zone only changes at DST boundaries, so caching by
// the input string is correct and cheap.
@Pipe({ name: 'tzLabel', standalone: true })
export class TimezoneLabelPipe implements PipeTransform {
  transform(tz: string | null | undefined): string {
    return tz ? timezoneWithOffset(tz) : '';
  }
}
